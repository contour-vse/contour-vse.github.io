/* Contour feedback: resource list.
   Each key is the id used in the QR link:  feedback/?r=<id>   (tutors add &role=tutor)
   type: wb = workbook, hw = homework, quiz = quiz, exam = practice exam
   sections: the real section names, in booklet order (used for the tier list, timing and order questions)
   skills: 3 short "I could now ..." lines for the student confidence screen
   struggles: optional quick taps for the tutor "what did students struggle with" screen */

window.CAMPUSES = [
  "Glen Waverley", "Box Hill", "Narre Warren", "Springvale", "Bentleigh", "Epping", "CBD", "Point Cook",
  "Online"
];

window.FEEDBACK_RESOURCES = {
  "y8-qr-1-1-wb": {
    title: "Advanced Quantitative Reasoning 1.1 Workbook",
    year: 8, subject: "Quantitative Reasoning", week: 1, type: "wb",
    sections: ["Your Selective Exam", "Mini Diagnostic", "Patterns", "Spatial Reasoning", "Logic", "Processes", "Review & Redo", "Exam Sprint"],
    skills: [
      "find the next term in a tricky number pattern",
      "picture a shape after it turns or flips",
      "use clues to work out who goes where"
    ],
    struggles: ["Reading the question", "Spotting the pattern", "Turning shapes in my head", "Keeping track of clues", "Working too slowly", "Careless slips"]
  },
  "y8-qr-1-1-hw": {
    title: "Advanced Quantitative Reasoning 1.1 Homework",
    year: 8, subject: "Quantitative Reasoning", week: 1, type: "hw",
    sections: ["Patterns", "Spatial Reasoning", "Logic", "Processes", "Mixed Practice", "Challenge Questions"],
    skills: [
      "find the next term in a tricky number pattern",
      "picture a shape after it turns or flips",
      "follow a process machine step by step"
    ],
    struggles: ["Reading the question", "Spotting the pattern", "Turning shapes in my head", "Keeping track of clues", "Working too slowly", "Careless slips"]
  },
  "y8-qr-1-1-quiz": {
    title: "Advanced Quantitative Reasoning 1.1 Quiz",
    year: 8, subject: "Quantitative Reasoning", week: 1, type: "quiz",
    sections: ["Patterns", "Spatial Reasoning", "Logic", "Processes"],
    skills: [
      "find the next term in a tricky number pattern",
      "picture a shape after it turns or flips",
      "use clues to work out who goes where"
    ],
    struggles: ["Reading the question", "Spotting the pattern", "Turning shapes in my head", "Keeping track of clues", "Running out of time", "Careless slips"]
  }
};

/* Used when the id in the link is not in the list above. */
window.FEEDBACK_FALLBACK = {
  title: "Contour Resource",
  year: null, subject: "", week: null, type: "wb",
  sections: ["Warm Up", "Teaching", "Practice Questions", "Challenge Questions"],
  skills: [
    "do the warm up questions on my own",
    "explain today's main idea to a friend",
    "get a challenge question right"
  ],
  struggles: ["Reading the question", "New ideas", "Working too slowly", "Careless slips"]
};
