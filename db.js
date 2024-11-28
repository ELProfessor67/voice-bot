const Datastore = require('nedb');
const db = new Datastore({ filename: 'database.db', autoload: true });

async function dbinsert(doc) {
    await db.insert(doc, (err, newDoc) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Inserted document:', newDoc);
        }
    });

}

async function dbfind(filter) {
    const tools = [
        {
          type: "function",
          function: {
            name: "get_needed_info",
            description: "",
            parameters: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "The user's name."
                },
                contact: {
                  type: "string",
                  description: "The user's contact."
                },
                email: {
                  type: "string",
                  description: "The user's email."
                }
              },
              required: ["name", "contact", "email"],
              additionalProperties: false,
            },
          }
        }
      ];
    return new Promise((resolve, reject) => {
        db.find(filter, (err, docs) => {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                resolve(docs[0]);
            }
        });
    });
}


module.exports = { dbinsert, dbfind }