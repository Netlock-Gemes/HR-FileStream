import re
import pymongo
import time
import motor.motor_asyncio
from bson.objectid import ObjectId
from pymongo.collation import Collation
from bson.errors import InvalidId
from FileStream.config import Telegram
from FileStream.server.exceptions import FIleNotFound

NAME_COLLATION = Collation("en", strength=2)
SORTS = {
    "newest": [("time", pymongo.DESCENDING)],
    "oldest": [("time", pymongo.ASCENDING)],
    "title": [("title", pymongo.ASCENDING)],
    "largest": [("file_size", pymongo.DESCENDING)],
}


def normalize(text: str) -> str:
    """Lowercase words split by single spaces, so "Mia.Rao_2" matches the name "mia rao"."""
    return re.sub(r"[\W_]+", " ", text or "", flags=re.UNICODE).strip().lower()


def word_pattern(term: str) -> str:
    return f"(^| ){re.escape(term)}( |$)"


class Database:
    def __init__(self, uri, database_name):
        self._client = motor.motor_asyncio.AsyncIOMotorClient(uri)
        self.db = self._client[database_name]
        self.col = self.db.users
        self.black = self.db.blacklist
        self.file = self.db.file
        self.people = self.db.cast
        self.catalogs = self.db.catalogs
        self.channels = self.db.channels
        self.settings = self.db.settings
        # Website logins. The bot's Telegram users stay in `users`
        self.accounts = self.db.accounts
        self.progress = self.db.progress
        self.saved = self.db.saved

    async def ensure_indexes(self):
        await self.file.create_index([("user_id", 1), ("file_unique_id", 1)])
        await self.file.create_index([("library", 1), ("time", -1)])
        await self.file.create_index([("channel_id", 1), ("message_id", 1)], sparse=True)
        await self.people.create_index("name", unique=True, collation=NAME_COLLATION)
        await self.accounts.create_index("username", unique=True, collation=NAME_COLLATION)
        await self.progress.create_index([("account", 1), ("file", 1)], unique=True)
        await self.progress.create_index([("account", 1), ("updated", -1)])
        await self.saved.create_index([("account", 1), ("file", 1)], unique=True)

#---------------------[ NEW USER ]---------------------#
    def new_user(self, id):
        return dict(
            id=id,
            join_date=time.time(),
            Links=0
        )

# ---------------------[ ADD USER ]---------------------#
    async def add_user(self, id):
        user = self.new_user(id)
        await self.col.insert_one(user)

# ---------------------[ GET USER ]---------------------#
    async def get_user(self, id):
        user = await self.col.find_one({'id': int(id)})
        return user

# ---------------------[ CHECK USER ]---------------------#
    async def total_users_count(self):
        count = await self.col.count_documents({})
        return count

    async def get_all_users(self):
        all_users = self.col.find({})
        return all_users

# ---------------------[ REMOVE USER ]---------------------#
    async def delete_user(self, user_id):
        await self.col.delete_many({'id': int(user_id)})

# ---------------------[ BAN, UNBAN USER ]---------------------#
    def black_user(self, id):
        return dict(
            id=id,
            ban_date=time.time()
        )

    async def ban_user(self, id):
        user = self.black_user(id)
        await self.black.insert_one(user)

    async def unban_user(self, id):
        await self.black.delete_one({'id': int(id)})

    async def is_user_banned(self, id):
        user = await self.black.find_one({'id': int(id)})
        return True if user else False

    async def total_banned_users_count(self):
        count = await self.black.count_documents({})
        return count
        
# ---------------------[ ADD FILE TO DB ]---------------------#
    async def add_file(self, file_info):
        file_info["time"] = time.time()
        fetch_old = await self.get_file_by_fileuniqueid(file_info["user_id"], file_info["file_unique_id"])
        if fetch_old:
            return fetch_old["_id"]
        await self.count_links(file_info["user_id"], "+")
        return (await self.file.insert_one(file_info)).inserted_id

# ---------------------[ FIND FILE IN DB ]---------------------#
    async def find_files(self, user_id, range):
        user_files=self.file.find({"user_id": user_id})
        user_files.skip(range[0] - 1)
        user_files.limit(range[1] - range[0] + 1)
        user_files.sort('_id', pymongo.DESCENDING)
        total_files = await self.file.count_documents({"user_id": user_id})
        return user_files, total_files

    async def get_file(self, _id):
        try:
            file_info=await self.file.find_one({"_id": ObjectId(_id)})
            if not file_info:
                raise FIleNotFound
            return file_info
        except InvalidId:
            raise FIleNotFound
    
    async def get_file_by_fileuniqueid(self, id, file_unique_id, many=False):
        if many:
            return self.file.find({"file_unique_id": file_unique_id})
        else:
            file_info=await self.file.find_one({"user_id": id, "file_unique_id": file_unique_id})
        if file_info:
            return file_info
        return False

# ---------------------[ TOTAL FILES ]---------------------#
    async def total_files(self, id=None):
        if id:
            return await self.file.count_documents({"user_id": id})
        return await self.file.count_documents({})

# ---------------------[ DELETE FILES ]---------------------#
    async def delete_one_file(self, _id):
        await self.file.delete_one({'_id': ObjectId(_id)})

# ---------------------[ UPDATE FILES ]---------------------#
    async def update_file_ids(self, _id, file_ids: dict):
        await self.file.update_one({"_id": ObjectId(_id)}, {"$set": {"file_ids": file_ids}})

# ---------------------[ PAID SYS ]---------------------#
#     async def link_available(self, id):
#         user = await self.col.find_one({"id": id})
#         if user.get("Plan") == "Plus":
#             return "Plus"
#         elif user.get("Plan") == "Free":
#             files = await self.file.count_documents({"user_id": id})
#             if files < 11:
#                 return True
#             return False
        
    async def count_links(self, id, operation: str):
        if operation == "-":
            await self.col.update_one({"id": id}, {"$inc": {"Links": -1}})
        elif operation == "+":
            await self.col.update_one({"id": id}, {"$inc": {"Links": 1}})

# ---------------------[ STREMIO LIBRARY ]---------------------#
    @staticmethod
    def library_query(*conditions, search=None, label=None, channel=None, hidden=False):
        """hidden: False leaves hidden videos out, True keeps only them, None keeps both."""
        parts = [{"library": True}, *conditions]
        if hidden is not None:
            parts.append({"hidden": True} if hidden else {"hidden": {"$ne": True}})
        if search:
            term = normalize(search)
            parts.append({"search_text": {"$regex": re.escape(term)}})
        if label:
            parts.append({"$or": [{"cast": label}, {"tags": label}]})
        if channel:
            parts.append({"channel_id": channel})
        return {"$and": parts}

    @staticmethod
    def catalog_query(catalog):
        """A video is in a catalog if it was picked or passes every rule, unless it was taken out."""
        kept = {"catalogs_excluded": {"$ne": catalog["_id"]}}
        if catalog.get("all"):
            return kept
        rules = []
        if catalog.get("cast"):
            rules.append({"cast": {"$in": catalog["cast"]}})
        if catalog.get("tags"):
            rules.append({"tags": {"$in": catalog["tags"]}})
        if catalog.get("channels"):
            rules.append({"channel_id": {"$in": catalog["channels"]}})
        if catalog.get("keywords"):
            pattern = "|".join(word_pattern(normalize(word)) for word in catalog["keywords"])
            rules.append({"search_text": {"$regex": pattern}})
        picked = {"catalogs": catalog["_id"]}
        return {"$and": [kept, {"$or": [picked, {"$and": rules}]} if rules else picked]}

    async def find_library(self, query, sort="newest", skip=0, limit=30):
        cursor = self.file.find(query).sort(SORTS.get(sort, SORTS["newest"])).collation(NAME_COLLATION)
        return await cursor.skip(skip).limit(limit).to_list(length=limit)

    async def count_library(self, query):
        return await self.file.count_documents(query)

    async def library_totals(self):
        result = await self.file.aggregate([
            {"$match": {"library": True}},
            {"$group": {"_id": None, "videos": {"$sum": 1}, "bytes": {"$sum": "$file_size"}}},
        ]).to_list(length=1)
        return result[0] if result else {"videos": 0, "bytes": 0}

    async def library_tags(self):
        return sorted(await self.file.distinct("tags", {"library": True}), key=str.lower)

    async def add_library_file(self, file_info, on_insert):
        return await self.file.find_one_and_update(
            {"user_id": file_info["user_id"], "file_unique_id": file_info["file_unique_id"]},
            {"$set": file_info, "$setOnInsert": on_insert},
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )

    async def get_library_file(self, _id):
        file_info = await self.get_file(_id)
        if not file_info.get("library"):
            raise FIleNotFound
        return file_info

    async def find_channel_post(self, channel_id, message_id):
        return await self.file.find_one({"channel_id": channel_id, "message_id": message_id})

    async def update_library_file(self, _id, fields=None, unset=None):
        update = {}
        if fields:
            update["$set"] = fields
        if unset:
            update["$unset"] = {key: "" for key in unset}
        if update:
            await self.file.update_one({"_id": ObjectId(_id), "library": True}, update)

    async def update_library_many(self, ids, update):
        await self.file.update_many({"_id": {"$in": [ObjectId(_id) for _id in ids]}, "library": True}, update)

    async def delete_library_messages(self, channel_id, message_ids):
        await self.file.delete_many({"channel_id": channel_id, "message_id": {"$in": message_ids}})

    async def untagged_search_text(self):
        return await self.file.find({"library": True, "search_text": {"$exists": False}}).to_list(length=None)

# ---------------------[ CAST ]---------------------#
    async def list_cast(self):
        return await self.people.find().collation(NAME_COLLATION).sort("name", 1).to_list(length=None)

    async def cast_by_names(self, names):
        return await self.people.find({"name": {"$in": names}}).to_list(length=None)

    async def get_person(self, _id):
        try:
            person = await self.people.find_one({"_id": ObjectId(_id)})
        except InvalidId:
            person = None
        if not person:
            raise FIleNotFound
        return person

    async def find_person(self, name):
        return await self.people.find_one({"name": name}, collation=NAME_COLLATION)

    async def add_person(self, name, aliases):
        result = await self.people.insert_one({"name": name, "aliases": aliases, "time": time.time()})
        return await self.people.find_one({"_id": result.inserted_id})

    async def update_person(self, _id, fields):
        await self.people.update_one({"_id": ObjectId(_id)}, {"$set": fields})

    async def rename_person(self, old, new):
        await self.file.update_many({"cast": old}, {"$set": {"cast.$": new}})
        await self.file.update_many({"cast_removed": old}, {"$set": {"cast_removed.$": new}})
        await self.catalogs.update_many({"cast": old}, {"$set": {"cast.$": new}})

    async def delete_person(self, person):
        await self.people.delete_one({"_id": person["_id"]})
        await self.file.update_many({"cast": person["name"]}, {"$pull": {"cast": person["name"]}})
        await self.catalogs.update_many({"cast": person["name"]}, {"$pull": {"cast": person["name"]}})

    async def match_person(self, name, terms):
        """Connects a person to every video naming them, except where they were removed by hand."""
        result = await self.file.update_many(
            {
                "library": True,
                "search_text": {"$regex": "|".join(word_pattern(term) for term in terms)},
                "cast": {"$ne": name},
                "cast_removed": {"$ne": name},
            },
            {"$addToSet": {"cast": name}},
        )
        return result.modified_count

    async def cast_counts(self):
        rows = await self.file.aggregate([
            {"$match": {"library": True}},
            {"$unwind": "$cast"},
            {"$group": {"_id": "$cast", "count": {"$sum": 1}}},
        ]).to_list(length=None)
        return {row["_id"]: row["count"] for row in rows}

# ---------------------[ CATALOGS ]---------------------#
    async def list_catalogs(self, enabled_only=False):
        query = {"enabled": True} if enabled_only else {}
        return await self.catalogs.find(query).sort("order", 1).to_list(length=None)

    async def get_catalog(self, _id):
        catalog = await self.catalogs.find_one({"_id": _id})
        if not catalog:
            raise FIleNotFound
        return catalog

    async def add_catalog(self, catalog):
        await self.catalogs.insert_one(catalog)

    async def update_catalog(self, _id, fields):
        await self.catalogs.update_one({"_id": _id}, {"$set": fields})

    async def delete_catalog(self, _id):
        await self.catalogs.delete_one({"_id": _id})
        await self.file.update_many(
            {"$or": [{"catalogs": _id}, {"catalogs_excluded": _id}]},
            {"$pull": {"catalogs": _id, "catalogs_excluded": _id}},
        )

    async def set_catalog_member(self, ids, catalog_id, member):
        if member:
            update = {"$addToSet": {"catalogs": catalog_id}, "$pull": {"catalogs_excluded": catalog_id}}
        else:
            update = {"$addToSet": {"catalogs_excluded": catalog_id}, "$pull": {"catalogs": catalog_id}}
        await self.update_library_many(ids, update)

    async def in_catalog(self, _id, catalog):
        return bool(await self.file.find_one({"$and": [{"_id": ObjectId(_id)}, self.catalog_query(catalog)]}, {"_id": 1}))

    async def count_excluded(self, catalog_id):
        return await self.file.count_documents({"catalogs_excluded": catalog_id})

    async def restore_excluded(self, catalog_id):
        await self.file.update_many({"catalogs_excluded": catalog_id}, {"$pull": {"catalogs_excluded": catalog_id}})

    async def addon_revision(self):
        settings = await self.settings.find_one({"_id": "addon"})
        return (settings or {}).get("revision", 0)

    async def bump_addon_revision(self):
        """Apps re-read a manifest whose version changed."""
        await self.settings.update_one({"_id": "addon"}, {"$inc": {"revision": 1}}, upsert=True)

# ---------------------[ ACCOUNTS ]---------------------#
    async def list_accounts(self):
        return await self.accounts.find().collation(NAME_COLLATION).sort("username", 1).to_list(length=None)

    async def get_account(self, _id):
        try:
            account = await self.accounts.find_one({"_id": ObjectId(_id)})
        except (InvalidId, TypeError):
            account = None
        if not account:
            raise FIleNotFound
        return account

    async def find_account(self, username):
        return await self.accounts.find_one({"username": username}, collation=NAME_COLLATION)

    async def add_account(self, username, password_hash):
        account = {"username": username, "password_hash": password_hash, "disabled": False,
                   "session_version": 0, "created": time.time(), "last_seen": 0}
        try:
            result = await self.accounts.insert_one(account)
        except pymongo.errors.DuplicateKeyError:
            raise ValueError("That username is taken.")
        account["_id"] = result.inserted_id
        return account

    async def update_account(self, _id, fields=None, sign_out=False):
        update = {}
        if fields:
            update["$set"] = fields
        if sign_out:
            update["$inc"] = {"session_version": 1}
        if update:
            await self.accounts.update_one({"_id": ObjectId(_id)}, update)

    async def delete_account(self, _id):
        await self.accounts.delete_one({"_id": ObjectId(_id)})
        await self.progress.delete_many({"account": str(_id)})
        await self.saved.delete_many({"account": str(_id)})

    async def files_by_ids(self, ids):
        """Visible library videos, in the order of ids."""
        object_ids = []
        for _id in ids:
            try:
                object_ids.append(ObjectId(_id))
            except (InvalidId, TypeError):
                pass
        files = await self.file.find({"$and": [{"_id": {"$in": object_ids}}, self.library_query(hidden=False)]}).to_list(length=None)
        by_id = {str(file_data["_id"]): file_data for file_data in files}
        return [by_id[str(_id)] for _id in object_ids if str(_id) in by_id]

# ---------------------[ WATCHING ]---------------------#
    async def save_progress(self, account, file, position, duration):
        await self.progress.update_one(
            {"account": account, "file": file},
            {"$set": {"position": position, "duration": duration, "updated": time.time()}},
            upsert=True,
        )

    async def get_progress(self, account, file):
        return await self.progress.find_one({"account": account, "file": file})

    async def recent_progress(self, account, limit=40):
        return await self.progress.find({"account": account}).sort("updated", -1).limit(limit).to_list(length=limit)

    async def progress_for(self, account, files):
        rows = await self.progress.find({"account": account, "file": {"$in": files}}).to_list(length=None)
        return {row["file"]: row for row in rows}

    async def set_saved(self, account, file, saved):
        if saved:
            await self.saved.update_one({"account": account, "file": file}, {"$setOnInsert": {"time": time.time()}}, upsert=True)
        else:
            await self.saved.delete_one({"account": account, "file": file})

    async def is_saved(self, account, file):
        return bool(await self.saved.find_one({"account": account, "file": file}, {"_id": 1}))

    async def saved_files(self, account, limit=200):
        rows = await self.saved.find({"account": account}).sort("time", -1).limit(limit).to_list(length=limit)
        return [row["file"] for row in rows]

# ---------------------[ CHANNELS ]---------------------#
    async def list_channels(self):
        return await self.channels.find().sort("time", 1).to_list(length=None)

    async def save_channel(self, channel_id, title):
        await self.channels.update_one(
            {"_id": channel_id},
            {"$set": {"title": title}, "$setOnInsert": {"enabled": True, "time": time.time()}},
            upsert=True,
        )

    async def update_channel(self, channel_id, fields):
        await self.channels.update_one({"_id": channel_id}, {"$set": fields})

    async def delete_channel(self, channel_id):
        await self.channels.delete_one({"_id": channel_id})

    async def channel_counts(self):
        rows = await self.file.aggregate([
            {"$match": {"library": True}},
            {"$group": {"_id": "$channel_id", "count": {"$sum": 1}}},
        ]).to_list(length=None)
        return {row["_id"]: row["count"] for row in rows}


db = Database(Telegram.DATABASE_URL, Telegram.SESSION_NAME)
