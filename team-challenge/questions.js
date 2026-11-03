/* Contour Live question bank: VSE Y8 [1.1] Advanced Quantitative Reasoning, Week 1.
   Edit freely. Each question:
     id      unique code (keep it the same as in keys.js and Code.gs)
     text    the stem (shown first)
     img     picture file in team-challenge/img/ (or a list of files), or null
     ask     the question line (shown in bold under the picture)
     options four answers in order A, B, C, D
   Correct answers are NOT kept here, so students cannot read them early.
   They live in team-challenge/keys.js (demo mode) and in _backend/Code.gs KEYS (live mode).
   If you change a key, change it in BOTH places. */
window.QUESTIONS = {
  warmup: [
    { id: "w1", text: "Ava buys 12 packs of stickers. Each pack has 25 stickers.", img: null,
      ask: "How many stickers does Ava buy?",
      options: ["250", "275", "300", "325"] },
    { id: "w2", text: "Here is a number pattern: 3, 7, 11, 15, ...", img: null,
      ask: "What is the next number?",
      options: ["18", "19", "20", "21"] },
    { id: "w3", text: "Opposite faces of a dice always add up to 7. A dice is sitting on a table with 4 on top.", img: null,
      ask: "What number is on the bottom face?",
      options: ["3", "4", "5", "6"] },
    { id: "w4", text: "Today is a Friday.", img: null,
      ask: "What day of the week will it be 10 days from today?",
      options: ["Sunday", "Monday", "Tuesday", "Friday"] },
    { id: "w5", text: "Half of a number is 18.", img: null,
      ask: "What is one third of the same number?",
      options: ["12", "18", "24", "54"] },
    { id: "w6", text: "Here is a number pattern: 3, 6, 12, 24, ...", img: null,
      ask: "What is the next number?",
      options: ["27", "30", "36", "48"] },
    { id: "w7", text: "A rectangle is 6 cm long and 4 cm wide.", img: null,
      ask: "What is the perimeter of the rectangle?",
      options: ["10 cm", "14 cm", "20 cm", "24 cm"] },
    { id: "w8", text: "Priya is taller than Leo. Sam is also taller than Leo.", img: null,
      ask: "Who is the tallest of the three?",
      options: ["Priya", "Sam", "Leo", "We can't tell"] }
  ],

  /* Section B: First Try (Mini Diagnostic), copied from the workbook */
  challenge: [
    { id: "c1", text: "Today is a Monday. Ishaan’s birthday is 100 days from today.", img: null,
      ask: "On what day of the week is Ishaan’s birthday?",
      options: ["Monday", "Tuesday", "Wednesday", "Thursday"] },
    { id: "c2", text: "The cube shown rolls along the path, tipping over an edge into each next square.", img: "c2-cube.png",
      ask: "Which letter is on top of the cube when it stops?",
      options: ["G", "H", "J", "K"] },
    { id: "c3", text: "Tomás thinks of a number. He multiplies it by 3, subtracts 6, halves the result, then adds 3. He ends up with 15.", img: null,
      ask: "What number did Tomás think of?",
      options: ["6", "10", "12", "14"] },
    { id: "c4", text: "A bag holds 6 red, 5 blue and 4 yellow marbles. Eamon takes marbles out one at a time without looking.", img: null,
      ask: "How many marbles must he take to be sure of having two red, three blue or four yellow marbles?",
      options: ["4", "5", "6", "7"] },
    { id: "c5", text: "Arjun makes rows of houses from matchsticks.", img: "c5-houses.png",
      ask: "How many matchsticks does Arjun need for Pattern 50?",
      options: ["506", "516", "560", "606"] },
    { id: "c6", text: "Nine students are at a meeting. Some pairs of them shake hands, and no pair shakes hands more than once. Each student then says how many hands they shook.", img: null,
      ask: "Which of these lists could be correct?",
      options: ["1, 1, 2, 2, 2, 3, 3, 3, 4", "3, 3, 3, 3, 3, 3, 3, 3, 3", "1, 2, 2, 3, 3, 4, 4, 5, 6", "0, 2, 2, 3, 3, 4, 4, 8, 8"] }
  ],

  /* Section H: Exam Sprint, workbook Q34 to Q43 */
  sprint: [
    { id: "s34", text: "A fence is made from posts and rails, as shown.", img: "s34-fence.png",
      ask: "How many posts and rails are needed for a fence with 30 panels?",
      options: ["121", "124", "150", "151"] },
    { id: "s35", text: "In a quiz game, 3 bonus points are added to Rohan's score, then his score is doubled, then 5 points are taken off. He ends with 21 points.", img: null,
      ask: "What was Rohan's score at the start?",
      options: ["10", "13", "14", "16"] },
    { id: "s36", text: "A square sheet of paper is folded in half twice. A circle and a half circle are punched through all the layers, as shown.", img: ["s36-fold.png", "s36-options.png"],
      ask: "Which of these shows the sheet when it is unfolded?",
      options: ["Sheet A", "Sheet B", "Sheet C", "Sheet D"] },
    { id: "s37", text: "Talia plants tomato seeds on a Wednesday. They are ready to pick 74 days later.", img: null,
      ask: "On what day of the week are the tomatoes ready to pick?",
      options: ["Monday", "Friday", "Saturday", "Sunday"] },
    { id: "s38", text: "A box holds 8 milk, 6 dark and 4 white chocolates. Georgia takes chocolates without looking.", img: null,
      ask: "How many must she take to be sure of having two chocolates of different flavours?",
      options: ["5", "9", "10", "15"] },
    { id: "s39", text: "Joaquin has five tiles, P to T, patterned on the top only. He covers the shape with three of them, with no gaps or overlaps. He can turn a tile but never lays one upside down.", img: "s39-tiles.png",
      ask: "Which three tiles does he use?",
      options: ["P, R and S", "P, R and T", "Q, R and S", "P, Q and R"] },
    { id: "s40", text: "The map shows the tracks between Dario's home, the shop and the beach. Dario walks from home to the beach and back. Each way he takes a direct track or goes through the shop, and he never uses a track twice.", img: "s40-map.png",
      ask: "How many different round trips can he take?",
      options: ["24", "26", "36", "38"] },
    { id: "s41", text: "Kirra threads 100 beads onto a string, starting from the left, in the repeating order shown. She then tips all 100 beads into a bag.", img: "s41-beads.png",
      ask: "How many beads must she take out, without looking, to be sure of getting 2 grey beads?",
      options: ["84", "85", "86", "87"] },
    { id: "s42", text: "Seven teams play in a netball competition. Each game is between two of the teams, and no two teams play each other more than once.", img: null,
      ask: "Which of these lists could be the number of games each team played?",
      options: ["5, 5, 5, 5, 5, 5, 5", "2, 3, 3, 4, 4, 5, 6", "2, 2, 3, 3, 4, 5, 7", "1, 2, 3, 3, 4, 5, 6"] },
    { id: "s43", text: "The cube shown rolls along the path, tipping over an edge into each next square.", img: "s43-cube.png",
      ask: "Which shape is on top of the cube when it stops?",
      options: ["Heart", "Hexagon", "Plus", "Square"] }
  ]
};
