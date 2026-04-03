const readline = require("readline");

async function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    // Hide user input while typing password.
    rl._writeToOutput = function _writeToOutput() {
      rl.output.write("*");
    };

    rl.question(`${question}: `, (answer) => {
      rl.output.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = {
  promptHidden
};
