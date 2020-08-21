# data-access

This library provides a database access class to enhance the standard database client API. It currently supports MongoDB and Cassandra DB.

The class must be subclassed to select a specific table/collection and should be instantiated on demand per client request. Multiple instances will reuse the same underlying database connection pool.

## Exports

-   Class `CassandraDatabaseAccess`
-   Class `MongoDatabaseAccess`
-   interface `InsertResult`
-   function `initDb(dbName: string, options: any): void`

## Initialization

```
import { initDb } from 'data-access'

const dbParams: any = {
    hostname: 'mongodb://127:0.0.1:27017',
    auth: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    },
};

initDb('mongodb', dbParams);
```

## Usage

```
import { MongoDatabaseAccess } from 'data-access';

class UserCollectionAccess extends MongoDatabaseAccess {
    private _account: string = '';

    constructor(account: string, username: string) {
        super('main-database', 'users', username);

        this._account = account;
    }

    public changeUserName(firstname: string, lastname: string): Promise<any> {
        return this.update(
            { account: this._account, email: this._username },
            { firstname, lastname }
        );
    }
}

function updateUserHandler(input, context, ext) {
    const db: UserTableAccess = new UserTableAccess(input.account, input.user);

    return db.changeUserName(input.firstname, input.lastname);
}
```

## MongoDatabaseAccess class methods

The listed methods are marked as protected and should only be called within a child class. All `options` arguments are passed directly to the mongodb driver.

##### MongoDatabaseAccess.constructor(dbName: string, collectionName: string, username: string)

Each subclass should be designed to access one database collection. The username is required for auditing.

### Query execution

##### MongoDatabaseAccess.find(filter: object, [options: object])

Selects documents matching `filter`, filtering out any documents where `__status = 'deleted'` (in memory, after the database results are retrieved). `filter` may be any valid MongoDB find filter.

Returns: a Promise resolving to an array of documents.

##### MongoDatabaseAccess.findAll(filter: object, [options: object])

Selects documents matching `filter` and immediately returns a raw MongoDB Cursor, for improved read performance.

Returns: an instance of mongo.Cursor.

##### MongoDatabaseAccess.insert(documents: any[], [options: object])

Inserts one or more documents into the table. The interface will automatically add auditing and version fields (this cannot currently be disabled).

Returns: a Promise resolving to a mongodb write operation result.

##### MongoDatabaseAccess.update(filter: object, document: object, [options: object])

Applies the update parameter `document` to the document matching `filter`. Allows MongoDB update-specific fields.

This method uses version checking, requiring `filter` to include a `__version` value to match against the updated document. A new random `__version` value will be set on the document, along with updated `__modifiedBy` and `__modifiedOn` values.

Returns: a Promise resolving to a mongodb write operation result.

##### MongoDatabaseAccess.updateUnsafe(filter: object, values: object, [options: object])

Applies the update parameter `document` to all documents matching `filter`. Allows MongoDB update-specific fields.

No version checking is used, and multiple documents will be updated if they match `filter`. New `__version`, `__modifiedBy`, and `__modifiedOn` values will be set on all updated documents.

Returns: a Promise resolving to a mongodb write operation result.

##### MongoDatabaseAccess.remove(filter: object, [options: object])

Performs a soft delete on one document matching `filter`, setting the document's `__status` value to 'deleted'.

This method uses version checking, requiring `filter` to include a `__version` value to match against the updated document. A new random `__version` value will be set on the document, along with updated `__modifiedBy` and `__modifiedOn` values.

Returns: a Promise resolving to a mongodb write operation result.

##### MongoDatabaseAccess.removeUnsafe(filter: object, [options: object])

Performs a soft delete on all documents matching `filter`, setting the documents' `__status` value to 'deleted'.

No version checking is used. A new random `__version` value will be set on every updated document, along with updated `__modifiedBy` and `__modifiedOn` values.

Returns: a Promise resolving to a mongodb write operation result.

##### MongoDatabaseAccess.removeHard(filter: object, [options: object])

Permanently deletes all documents matching `filter`.

Returns: a Promise resolving to a mongodb write operation result.

---

See packaged API documentation for raw query generation methods.
