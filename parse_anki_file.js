const JSZip = require("jszip"); // Used for zipping/unzipping in-memory on client-side
const initSqlJs = require("sql.js"); // Used to read and update anki files in-memory on client-side

var deck_info = {};
var selected_decks = {};
var selected_columns = {};
var db;
var zip;
var used_models = {};
curr_test_cards = {};

// Function to process user file for further processing
window.process_file_upload = async function(anki_file, callback) {
    console.log(anki_file);
    deck_info = {};

    // Apkg is a zip file that has 2 db files and a folder for media (.anki21 is the one we need)
    unzipFile(anki_file, async function(fileData) {
        if (fileData) {
            const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });

            // Create db with user anki21 file as arraybuffer
            db = new SQL.Database(fileData);
            const return_rslt = db.exec("SELECT * FROM col");
            console.log(return_rslt);

            // Create JSON with additional info from user decks
            let deck_graph = window.get_apkg_deck_graph(db);
            console.log("deck_graph");
            console.log(deck_graph);

            // Create html list from JSON to expose to user
            let html_graph = window.create_html_from_json(deck_graph);
            console.log("html_graph");
            console.log(html_graph);
            let graphs = {
                "deck_graph": deck_graph,
                "html_graph": html_graph,
                "deck_info": deck_info // Deck info is kept as global variable and is filled in function get_apkg_deck_graph 
            };
            callback(graphs);
        }
    
    });

}

window.get_apkg_deck_graph = function(db) {

    let models = db.exec("select models from col");
    console.log("models");
    console.log(models[0].values[0]);

    // Get all models from user decks
    models = JSON.parse(models[0].values[0]);
    let deck_graph = {}; // JSON to store final anki deck graph

    // Get all decks from user
    let decks = db.exec("select decks from col");
    console.log("this");
    console.log(decks);
    decks = JSON.parse(decks[0].values[0]);
    console.log("there");
    console.log(decks);
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
                "name": (decks[deck_id].name).replaceAll("::", "-").replaceAll(" ", "_")
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

// Function to get random cards from a collection of cards
get_random_cards_of_deck = function(db, selected_decks, number_of_cards) {

    let anki_cards = [];

    // Get all cards that the user wants to select from
    for (let selected_deck of selected_decks) {
        let deck_cards = db.exec("select nid from cards where did = '"+ selected_deck +"'");
        anki_cards.push(...deck_cards[0].values);    
    }

    let random_cards = [];

    if (number_of_cards == "all") {
         number_of_cards = anki_cards.length;
    }

    // Get number of cards to user wants
    for (let i = 0; i < number_of_cards; i++) {


        let random_index = Math.floor(Math.random() * anki_cards.length);
        let note = db.exec("select mid, flds from notes where id = '" + anki_cards[random_index][0] + "'");
        console.log(note);
        console.log(note[0]);
        console.log(note[0].values);
        console.log(note[0].values[0]);
        console.log(note[0].values[1]);
        console.log(used_models);

        let column_header = used_models[note[0].values[0][0]];
        let column_values = note[0].values[0][1];
        console.log(column_header);        
        console.log(column_values);

        // Anki card values are a string seperated by a special character
        column_values = column_values.split("");
        note = {};

        // Assign card value to corresponding column
        for (let j = 0; j < column_values.length; j++) {
            note[column_header[j]] = column_values[j];
        }

        console.log(note);
        random_cards.push(note);

        // Remove cards from list, os no duplicates can happen
        anki_cards.splice(random_index, 1);
    }

    console.log("Random card deck");
    console.log(random_cards);
    return random_cards;
}

// Function to create random cards to expose to user in an infinite loop
window.create_q_and_a_decks = function(decks, card_count, column_options, shown_rnd_counter, callback) {
    let deck_ids = [];
    for (let check_box_id in decks) {
        console.log(selected_decks);
        deck_ids.push(deck_info[check_box_id].model.dict_id);
    }

    let random_cards = {
        "questions": [],
        "answers": get_random_cards_of_deck(db, deck_ids, card_count)
    };

    // Create question cards from answer cards
    random_cards.questions = get_question_flashcards(random_cards.answers, column_options, shown_rnd_counter);
    curr_test_cards = random_cards;
    callback(random_cards);
}

// Function to create question cards from cards and user options
get_question_flashcards = function(card_array, column_options, shown_rnd_counter) {
    let question_flashcards = [];
    console.log(column_options);
    console.log(shown_rnd_counter);
    for (let card of card_array) {
        let q_card = {}
        let rnd_column = [];
        console.log("HEREHEREHERE");
        console.log(card);

        // For each column of card check how to handle value depending on user configs
        for (let column in card) {
            
            switch(column_options[column]) {
                case "always_shown":
                    q_card[column] = card[column];
                    break;

                case "never_shown":
                    q_card[column] = "???";
                    break;
                    
                case "random":
                    q_card[column] = "???";
                    rnd_column.push(column);
                    break;
            }

        }

        // Display columns labeled as random depending on how many user wants to see
        for (let i = 0; i < shown_rnd_counter; i++) {
            let random_card_number = Math.floor(Math.random() * rnd_column.length);
            q_card[rnd_column[random_card_number]] = card[rnd_column[random_card_number]];
            rnd_column.splice(random_card_number, 1);
        }

        question_flashcards.push(q_card);
        
    }

    console.log(question_flashcards);
    return question_flashcards;

}

// Will be deleted or changed soon, so no comments yet
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

window.get_question_cards = function() {
    return curr_test_cards.questions;
}

window.get_answer_cards = function() {
    return curr_test_cards.answers;
}

function unzipFile(inputZipFile, callback){
    // Create a new instance of the zip object
    zip = new JSZip();
  
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
                    console.log(new TextDecoder().decode(fileData));
                    callback(fileData);
                  });
            }
        });
      });
    };
  
    // Read the inputZipFile as an arraybuffer
    reader.readAsArrayBuffer(inputZipFile);
}

// Function to create html list from JSON deck
window.create_html_from_json = function(input_json) {

        // Create html string
        let html_string = "";
        let counter = 0;
        html_string += '<ul class="tree">';
        
        for (let sub_item_name in input_json) {
            counter++;
            html_string += '<li><div><input type="checkbox" onclick="handle_deck_click(this)" id="checkbox' + counter + '" name="' + sub_item_name + '">' + sub_item_name + '</div>';
            if (!input_json[sub_item_name].model) {
            [html_string, counter] = recursive_html_create(input_json[sub_item_name], html_string, counter);     
            } else {
                deck_info["checkbox" + counter] = input_json[sub_item_name];
            }   
        }
        html_string += "</ul>";
        return html_string;
}

// Used in create_html_from_json for recursive graph traversal
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

// Function to get information for checkbox id of deck
window.get_deck_info_for_id = function(column_id) {
    let selected_deck = deck_info[column_id];
    console.log(deck_info);
    console.log(selected_deck);
    let columns = selected_deck.model.columns;
    return columns;

}

// Function used to create a learning plan using anki decks
window.create_anki_learning_plan = function(decks, start_date, learning_days, callback) {
 
    // Get all ids that you will need to create new ones of to make sure no ids are duplicated
    let curr_decks = db.exec("select decks from col");
    curr_decks = JSON.parse(curr_decks[0].values[0]);

    // Card ids are return as 2d array, so we need to loop through it to get all  
    curr_cards = db.exec("select id from cards");
    curr_cards = curr_cards[0].values;
    let card_ids = [];
    console.log(curr_cards);
    for (let id_array of curr_cards) {
        card_ids.push(id_array[0]);
    }
    console.log(card_ids);
    let all_notes = db.exec("select * from notes");
    console.log("CHECKCHECK");
    console.log(all_notes);
    all_notes = all_notes[0].values;
    let note_ids = [];
    let note_json = {};

    for (let note_array of all_notes) {
        note_ids.push(note_array[0]);
        note_json[note_array[0]] = note_array;

    }
    console.log(note_ids);
    console.log(note_json);


    let deck_creation_id = 1111111111111;
    let card_creation_id = 1111111111111;
    let note_creation_id = 1111111111111;

    for (let check_box_id in selected_decks) {
        console.log(selected_decks);
        let selected_deck_overhead = {};
        let deck_id = deck_info[check_box_id].model.dict_id;
        console.log(deck_info[check_box_id]);
        selected_deck_overhead = JSON.parse( JSON.stringify(curr_decks[deck_id]) ); // Done to get a copy of the selected deck
        console.log(selected_deck_overhead);
        console.log(selected_decks[check_box_id]);

        // Get new id for deck and make sure it is unique
        let id_found = false;
        while (id_found == false) {
            if (!(deck_creation_id in curr_decks)) {
                selected_deck_overhead.id = deck_creation_id;
                curr_decks[deck_creation_id] = "";
                id_found = true;
            } else {
                deck_creation_id++;
            }
        }

        // Create new decks for user cards to be learned
        selected_deck_overhead.name = "Learning_Plan::" + selected_decks[check_box_id].model.name;
        selected_deck_overhead.desc = "Learning Plan for " + selected_decks[check_box_id].model.name;
        selected_deck_overhead.lrnToday = [0, 0];
        selected_deck_overhead.newToday = [0, 0];
        selected_deck_overhead.revToday = [0, 0];
        selected_deck_overhead.timeToday = [0, 0];
        selected_deck_overhead.mod; // TODO check what mod does

        curr_decks[deck_creation_id] = selected_deck_overhead
        console.log(deck_info);
        let deck_model = selected_decks[check_box_id].model.model_used; // Maybe can be deleted

        // Get all cards from selected deck
        let deck_cards = db.exec("select * from cards where did = '"+ deck_id +"'");
        console.log("CARDS HERE");
        console.log(deck_cards);
        deck_cards = deck_cards[0].values;
        console.log(deck_cards);

        // Create deck for each date
        let cards_per_day = Math.ceil(deck_cards.length / learning_days); 
        console.log("CARDS PER DAY");
        console.log(cards_per_day);
        console.log(learning_days);
        let overall_card_counter = 0;
        let creation_done = false;
        for (let day_counter = 0; day_counter < learning_days; day_counter++) {
            console.log("WORKS");
            let curr_day = new Date();
            curr_day.setDate(start_date.getDate() + day_counter);
            let curr_day_string = curr_day.getFullYear() + "-" + (curr_day.getMonth() + 1).toString().padStart(2, '0') + "-" + curr_day.getDate().toString().padStart(2, '0');
            let temp_deck = JSON.parse( JSON.stringify(curr_decks[deck_id]) ); // Done to get a copy of the selected deck
            // Get new id for deck and make sure it is unique
            id_found = false;
            while (id_found == false) {
                if (!(deck_creation_id in curr_decks)) {
                    temp_deck.id = deck_creation_id;
                    curr_decks[deck_creation_id] = "";
                    id_found = true;
                } else {
                    deck_creation_id++;
                }
            }

            // Create deck with reset metadata just in case
            temp_deck.name = selected_deck_overhead.name + "::" + curr_day_string;
            temp_deck.desc = selected_deck_overhead.desc + " Date: " + curr_day_string;
            temp_deck.lrnToday = [0, 0];
            temp_deck.newToday = [0, 0];
            temp_deck.revToday = [0, 0];
            temp_deck.timeToday = [0, 0];
            curr_decks[deck_creation_id] = temp_deck;

            // Create new cards and notes as anki only allows one deck per card and deletes duplicates
            for (let cpd_counter = 0; cpd_counter < cards_per_day; cpd_counter++) {
                console.log(deck_cards);
                console.log(overall_card_counter);
                console.log(deck_cards.length);
                console.log(deck_cards[overall_card_counter]);
                let curr_card = [...deck_cards[overall_card_counter]];
                // Get new id for card and make sure it is unique
                let id_found = false;
                while (id_found == false) {
                    if (!card_ids.includes(card_creation_id)) {
                        curr_card[0] = card_creation_id;
                        card_ids.push(card_creation_id);
                        id_found = true;
                    } else {
                        card_creation_id++;
                    }
                }
                curr_card[2] = temp_deck.id

                // Create new note 
                let tmp = curr_card[1];
                console.log(tmp);
                tmp = note_json[tmp + ""];
                console.log(tmp);
                let new_note = [...tmp];
                id_found = false;
                while (id_found == false) {
                    if (!note_ids.includes(note_creation_id)) {
                        curr_card[1] = note_creation_id
                        new_note[0] = note_creation_id;
                        const length = 10;
                        let result = '';

                        // Anki checks duplicate cards by checking note guid (not content as they claim in their docs)
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!§$%&{}():~+-,[]<>/|@=?#*';
                        const charactersLength = characters.length;
                        for (let i = 0; i < length; i++) {
                          result += characters.charAt(Math.floor(Math.random() * charactersLength));
                        }
                        new_note[1] = result; // TODO: add a way to get a random guid string
                        note_ids.push(note_creation_id);
                        id_found = true;
                    } else {
                        note_creation_id++;
                    }
                }

                // Convert card data into sql statement to push into db
                let sql_insert_string = "";
                for (let column_value of curr_card) {
                    if (typeof(column_value) === "string")  {
                        sql_insert_string += "'" + column_value + "'";
                    } else {
                        sql_insert_string += column_value;
                    }
    
                    sql_insert_string += ", ";
                }
                sql_insert_string = sql_insert_string.slice(0, -2);
                db.exec("insert into cards values (" + sql_insert_string +")");

                // Convert note data into sql statement to push into db
                sql_insert_string = "";
                for (let column_value of new_note) {
                    if (typeof(column_value) === "string")  {
                        sql_insert_string += "'" + column_value.replaceAll("'", "''") + "'";
                    } else {
                        sql_insert_string += column_value;
                    }
    
                    sql_insert_string += ", ";
                }
                sql_insert_string = sql_insert_string.slice(0, -2);
                db.exec("insert into notes values (" + sql_insert_string +")");

                // Needed in case last deck has less than calculated number of cards per deck
                overall_card_counter++;
                if (overall_card_counter == deck_cards.length) {
                    creation_done = true;
                    break;
                }
            }

            // Needed in case last deck is not needed because there are less cards than days for learning plan
            if (creation_done) {
                break;
            }

        }

        // Update db with new values
        let fixed_deck_string = JSON.stringify(curr_decks);
        fixed_deck_string = fixed_deck_string.replaceAll("'", "''");
        db.exec("update col set decks = '" + fixed_deck_string + "'");

    }

    // Export db to update user given zip file with new anki21 file
    const db_binary_array = db.export();
    let sql_string = new TextDecoder().decode(db_binary_array);
    zip.remove("collection.anki21");
    zip.file("collection.anki21", db_binary_array);
    zip.generateAsync({type:"uint8array"})
    .then(function (content) {
        callback(content);
    });

}

window.get_checked_columns = function() {
    return selected_columns;
}

window.get_checked_decks = function() {
    return selected_decks;
}

window.change_checked_deck = function(check_box_id, checked) {

    if (checked) {
        selected_decks[check_box_id] = deck_info[check_box_id];
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
