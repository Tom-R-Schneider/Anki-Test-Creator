const AdmZip = require("adm-zip");
const Database = require('better-sqlite3');

anki_file = "anki_example_file/test_for_anki.apkg"

const zip = new AdmZip(anki_file);
var zipEntries = zip.getEntries();

for (var i = 0; i < zipEntries.length; i++) {
    if (zipEntries[i].entryName == "collection.anki21") {

        let anki2_data = zipEntries[i].getData();
        const db = new Database(anki2_data);
        const files = db.prepare("select name from sqlite_master where type='table'").all();
        console.log(files);
        let deck_graph = get_apkg_deck_graph(db);
        db.close();
    }
}


function get_apkg_deck_graph(db) {

    let deck_graph = {};
    let decks = db.prepare("select decks from col").all();
    decks = JSON.parse(decks[0].decks);
    for (let deck_id in decks) {
        // Skip default deck as it is not needed
        if (deck_id == 1) {
            continue;
        }

        // Anki decks are seperated with '::' in given path
        let deck_list = decks[deck_id].name.split("::");
        let curr_branch = deck_graph;
        for (let deck of deck_list) {
            // Check if branch already exists
            if (!curr_branch[deck]) {
                curr_branch[deck] = {};
            }
            curr_branch = curr_branch[deck];
        }
    }
    console.log(deck_graph);
    return deck_graph;
}