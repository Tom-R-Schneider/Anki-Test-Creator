const {AdmZip} = require("adm-zip");
const {Database} = require('better-sqlite3'); // TODO: look for a new in-memory db that works in the browser


window.process_file_upload = function(anki_file) {
    // anki_file = "anki_example_file/All Decks.apkg";

    const zip = new AdmZip(anki_file);
    var zipEntries = zip.getEntries();

    for (var i = 0; i < zipEntries.length; i++) {
        if (zipEntries[i].entryName == "collection.anki21") {

            let anki2_data = zipEntries[i].getData();
            const db = new Database(anki2_data);
            const files = db.prepare("select name from sqlite_master where type='table'").all();
            console.log(files);
            //let deck_graph = window.get_apkg_deck_graph(db);
            //window.preconfigure_calculation_inputs(db);
            db.close();
        }
    }
}

window.get_apkg_deck_graph = function(db) {

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
                "dict_id": decks[deck_id].id,
                "card_count": card_count,
                "columns": [],
                "model_used": "",
                "selected": false
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

//Used to preconfigure input data for create_solution_excel
window.preconfigure_calculation_inputs = function(db) {



    let selected_decks = [1668817277940]; // Used as example

    let columns = {
        0: {
            name: "Front",
            active: true,
            randomized: true,
            always_shown: false,
            never_shown: false,
            newly_added: false
        },
        1: {
            name: "Back",
            active: true,
            randomized: true,
            always_shown: false,
            never_shown: false,
            newly_added: false
        }
    };
    window.create_excels(db, selected_decks, columns, 1, 20, 1);
}

window.create_excels = function(db, selected_decks, columns, number_of_tests, number_of_rows, number_of_random_cols) {

    // Get all cards from selected decks
    let all_cards = [];
    for (let selected_deck of selected_decks) {
        let deck_cards = db.prepare("select * from cards where did = '"+ selected_deck +"'").all();
        all_cards.push(...deck_cards);    
    }

    // Get column positions of selected columns
    let random_col = [];
    let always_shown_col = [];
    let header_col = [];
    let inactive_col = [];
    let never_shown_col = [];
    for (let column_id in columns) {
        if (columns[column_id].active) {
            header_col.push(columns[column_id].name);
            if (columns[column_id].randomized) {
                random_col.push(column_id);
            } else if (columns[column_id].always_shown) {
                always_shown_col.push(column_id);
            } else if(columns[column_id].never_shown) {
                never_shown_col.push(column_id);
            }
        } else {
            inactive_col.push(column_id);
        }
    }

    //TODO: Create code to get all cards and their data for selected decks
    for (let i = 0; i < number_of_tests; i++) {
        let curr_test_cards = JSON.parse(JSON.stringify(all_cards));
        let sol_excel_columns = [];
        let quest_excel_columns = [];

        sol_excel_columns.push(header_col);
        quest_excel_columns.push(header_col);
    
        // Get data for each card selected
        for (let j = 0; j < number_of_rows; j++) {

            // Select random card and remove it from current deck of cards
            let random_card_number = Math.floor(Math.random() * curr_test_cards.length);
            let random_card = curr_test_cards[random_card_number];
            curr_test_cards.splice(random_card_number, 1);
            let card_note = db.prepare("select * from notes where id = '" + random_card.nid + "'").all();
            console.log(card_note);
            card_note = card_note[0];
            card_data = card_note.flds;
            card_data = card_data.split("");
            console.log(card_data);
            quest_card_data = JSON.parse(JSON.stringify(card_data));

            for (let never_shown of never_shown_col) {
                quest_card_data[never_shown] = "";
            }

            let random_col_temp = JSON.parse(JSON.stringify(random_col));
            for (let r = 0; r < number_of_random_cols; r++) {

                let random_card_number = Math.floor(Math.random() * random_col_temp.length);
                let random_column = random_col_temp[random_card_number];
                random_col_temp.splice(random_column, 1);
                quest_card_data[random_column] = "";
            }

            // Remove inactive columns
            for (let inactive_c of inactive_col) {
                card_data.splice(inactive_c, 1);
                quest_card_data.splice(inactive_c, 1);
            }
            sol_excel_columns.push(card_data);
            quest_excel_columns.push(quest_card_data);

        }
        console.log(sol_excel_columns);
        console.log(quest_excel_columns);
    }
}