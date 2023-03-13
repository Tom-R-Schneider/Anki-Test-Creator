const AdmZip = require("adm-zip");
const Database = require('better-sqlite3');

anki_file = ""

const zip = new AdmZip(anki_file);
var zipEntries = zip.getEntries();

for (var i = 0; i < zipEntries.length; i++) {
    if (zipEntries[i].entryName == "collection.anki21") {

        let anki2_data = zipEntries[i].getData();
        const db = new Database(anki2_data);
        const files = db.prepare("select name from sqlite_master where type='table'").all();
        
        db.close();
    }
}
