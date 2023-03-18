const AdmZip = require("adm-zip");
const Database = require('better-sqlite3');

anki_file = "anki_example_file/All Decks.apkg"

const zip = new AdmZip(anki_file);
var zipEntries = zip.getEntries();

for (var i = 0; i < zipEntries.length; i++) {
    if (zipEntries[i].entryName == "collection.anki21") {

        let anki2_data = zipEntries[i].getData();
        const db = new Database(anki2_data);
        const files = db.prepare("select name from sqlite_master where type='table'").all();
        console.log(files);
        console.log(db.prepare("select * from revlog").all());
        console.log(db.prepare("select * from cards").all());
        console.log(db.prepare("select * from notes").all());
        let deck_graph = get_apkg_deck_graph(db);
        db.close();
    }
}


function get_apkg_deck_graph(db) {

    let models = db.prepare("select * from col").all();
    models = JSON.parse(models[0].models);
    let deck_graph = {}; // JSON to store final anki deck graph
    let used_models = {}; // Used to track models and their cleaned up columns to reduce processing steps
    let decks = db.prepare("select decks from col").all();
    decks = JSON.parse(decks[0].decks);
    for (let deck_id in decks) {

        // Skip default deck as it is not needed for this graph
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
        // Get card models and columns if there are cards in the current deck
        card_count = db.prepare("select count (*) from cards where did = '"+ decks[deck_id].id +"'").all();
        card_count = card_count[0]["count (*)"];

        if (card_count > 0) {

            // One card needed to route from dict to model
            example_card = db.prepare("select * from cards where did = '"+ decks[deck_id].id +"' limit 0, 1").all();
            example_card = example_card[0];

            curr_branch["model"] = {
                "card_count": card_count,
                "columns": [],
                "model_used": "" 
            };

            // Get card model used for dict
            let card_note = db.prepare("select * from notes where id = '" + example_card.nid + "'").all();
            card_note = card_note[0];
            let card_model = models[card_note.mid]
            curr_branch.model.model_used = card_model.id;    
            // Push column names into list to use later
            if (!used_models[card_model.id]) {
                let columns = [];
                for (let column of card_model.flds) {
                    columns.push(column.name);
                }
                used_models[card_model.id] = columns;
            }
            curr_branch.model.columns = used_models[card_model.id];
        }    
    }

    console.log(deck_graph);
    return deck_graph;
}