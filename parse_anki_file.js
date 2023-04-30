const JSZip = require("jszip");
const initSqlJs = require("sql.js");

// Required to let webpack 4 know it needs to copy the wasm file to our assets
//const sqlWasm = require("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js");

var deck_info = {};
var selected_decks = {};
var selected_columns = {};


window.process_file_upload = async function(anki_file, callback) {
    // anki_file = "anki_example_file/All Decks.apkg";
    console.log(anki_file);
    deck_info = {};

    unzipFile(anki_file, async function(fileData) {
        if (fileData) {
            const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
            const db = new SQL.Database(fileData);
            const return_rslt = db.exec("SELECT * FROM col");
            console.log(return_rslt);
            let deck_graph = window.get_apkg_deck_graph(db);
            console.log("deck_graph");
            console.log(deck_graph);
            let html_graph = window.create_html_from_json(deck_graph);
            console.log("html_graph");
            console.log(html_graph);
            let graphs = {
                "deck_graph": deck_graph,
                "html_graph": html_graph,
                "deck_info": deck_info
            };
            callback(graphs);
        }
    
    });

}

window.get_apkg_deck_graph = function(db) {

    let models = db.exec("select models from col");
    console.log("models");
    console.log(models[0].values[0]);
    models = JSON.parse(models[0].values[0]);
    let deck_graph = {}; // JSON to store final anki deck graph
    let used_models = {}; // Used to track models and their cleaned up columns to reduce processing steps
    let decks = db.exec("select decks from col");
    decks = JSON.parse(decks[0].values[0]);
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
        card_count = db.exec("select count (*) from cards where did = '"+ decks[deck_id].id +"'");
        console.log(card_count);
        card_count = card_count[0].values[0][0];

        if (card_count > 0) {

            // One card needed to route from dict to model
            let example_card = db.exec("select nid from cards where did = '"+ decks[deck_id].id +"' limit 0, 1");
            console.log(example_card);
            let example_card_nid = example_card[0].values[0];

            curr_branch["model"] = {
                "dict_id": decks[deck_id].id,
                "card_count": card_count,
                "columns": [],
                "model_used": "",
                "selected": false
            };

            // Get card model used for dict
            let card_note = db.exec("select mid from notes where id = '" + example_card_nid + "'");
            console.log(card_note);
            let card_note_mid = card_note[0].values[0];
            let card_model = models[card_note_mid]
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
        let deck_cards = db.exec("select * from cards where did = '"+ selected_deck +"'");
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
            let card_note = db.exec("select * from notes where id = '" + random_card.nid + "'");
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

function unzipFile(inputZipFile, callback){
    // Create a new instance of the zip object
    var zip = new JSZip();
  
    // Use the FileReader API to read the contents of the inputZipFile
    var reader = new FileReader();
    reader.onload = function(event){
      // Add the contents of the file to the zip object
        zip.loadAsync(event.target.result).then(function(zip) {
        // List all the files in the zip object
        zip.forEach(function (relativePath, zipEntry) {
            if (relativePath == "collection.anki21") {
                zipEntry.async("uint8array").then(function (fileData) {
                    console.log("File: " + relativePath);
                    console.log("Data: " + fileData);
                    callback(fileData);
                  });
            }
          // Extract each file from the zip object and log it to the console

        });
      });
    };
  
    // Read the inputZipFile as an arraybuffer
    reader.readAsArrayBuffer(inputZipFile);
}

window.create_html_from_json = function(input_json) {

        // Create html string
        let html_string = "";
        let counter = 0;
        html_string += '<li><div>Your Decks</div>';
        html_string += "<ul>";
        for (let sub_item_name in input_json) {
            counter++;
            html_string += '<li><div><input type="checkbox" onclick="window.handle_deck_click(this)" id="checkbox' + counter + '">' + sub_item_name + '</div>';
            if (!input_json[sub_item_name].model) {
            [html_string, counter] = recursive_html_create(input_json[sub_item_name], html_string, counter);     
            } else {
                deck_info["checkbox" + counter] = input_json[sub_item_name];
            }   
        }
        html_string += "</ul>";
        return html_string;
}

function recursive_html_create(item, html_string, counter) {
    if (!item.model) {
        html_string += "<ul>";
        for (let sub_item_name in item) {
            counter++;
            html_string += '<li><div><input type="checkbox" onclick="handle_deck_click(this)" id="checkbox' + counter + '">' + sub_item_name + '</div>';
            [html_string, counter] = recursive_html_create(item[sub_item_name], html_string, counter);
        }
        html_string += "</ul>";
    } else {
        console.log("Deck Info");
        console.log(deck_info);
        console.log(item);
        deck_info["checkbox" + counter] = item;
    }
    return [html_string, counter];

}

window.get_deck_info_for_id = function(column_id) {
    let selected_deck = deck_info[column_id];
    console.log(deck_info);
    console.log(selected_deck);
    let columns = selected_deck.model.columns;
    return columns;

}

window.get_option_html_for_learning_plan = function() {
    let html_string = "";
    html_string += "<div><h1>Options</h1></div>";
    html_string += '<label for="start_date">Start Date:</label><input type="date" id="start_date" name="start_date">';
    html_string += '<div><input type="radio" id="days_duration" name="learning_duration" value="number of days" checked><label for="days_duration">Number of Days: <input type="number" id="input_days" name="days" min="1"></label></div>';
    html_string += '<div><input type="radio" id="date_duration" name="learning_duration" value="End Date"><label for="date_duration">End Date: </label><input type="date" id="end_date" name="end_date"></div>';
    html_string += '<div><input type="checkbox" id="merge_bool" name="merge"><label for="date_duration">Merge decks</label></div>';


    return html_string;
}

window.create_anki_learning_plan = function(decks, columns, merge_bool, start_date, end_date) {
 
}

window.get_checked_columns = function() {
    return selected_columns;
}

window.get_checked_decks = function() {
    return selected_decks;
}

window.change_checked_deck = function(check_box_id, checked) {
    if (checked) {
        selected_decks[check_box_id] = "";
    } else {
        delete selected_decks[check_box_id];
    }
}

window.change_checked_column = function(check_box_id, checked) {
    if (checked) {
        selected_columns[check_box_id] = "";
    } else {
        delete selected_columns[check_box_id];
    }
}
