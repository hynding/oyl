import data from "./data.js";

const ID_MAP = {};
const ID_DATA = data.map((item, index) => {
  ID_MAP[index] = item;
  return {
    id: index,
    ...item,
  };
});
let items;
let answered;
let total = 46;
let pass = 38;

const elResetButton = document.getElementById("reset-test");
const elCheckButton = document.getElementById("check-answers");
const elTotalAnsweredSpan = document.getElementById("total-answered");
const elTotalAnswersSpan = document.getElementById("total-answers");
const elResults = document.getElementById("results");

start();

function start() {
  console.log("start");
  elResetButton.classList.add("hidden");
  elCheckButton.classList.add("hidden");
  elTotalAnsweredSpan.innerHTML = 0;
  elTotalAnswersSpan.innerHTML = total;
  elResults.innerHTML = "";

  items = [];
  answered = new Array(total).fill(null);
  const _items = [...ID_DATA];
  for (let i = 0; i < total; i++) {
    const index = Math.floor(Math.random() * _items.length);
    const item = _items.splice(index, 1)[0];
    items.push(item);
  }
  render();
}

function getMultipleChoiceAnswers(item) {
  const answers = [item.answer, ...item.wrongAnswers];
  return shuffleArray(answers);
}

function render() {
  const elMain = document.querySelector("main");
  elMain.innerHTML = "";
  items.forEach((item, index) => {
    const answers = getMultipleChoiceAnswers(item);
    const options = answers.map((answer, answerIndex) => {
      const name = `answer_${index}_${item.id}`;
      const id = `${name}_${answerIndex}`;
      return `
            <div>
                <input type="radio" id="${id}" class="answer" name="${name}" value="${answer}" />
                <label for="${id}" id="label_${id}">${answer}</label>
            </div>
        `;
    });
    elMain.innerHTML += `
      <div id="q_${item.id}">
        <h2>${item.question}</h2>
        <div>
            ${options.join("")}
        </div>
      </div>
    `;
  });
  const answers = document.querySelectorAll("input.answer");
  answers.forEach((answer) => {
    answer.addEventListener("click", (event) => {
      console.log(event.target.id);
      const { id, value } = event.target;
      const [_, index, itemId, answerIndex] = id.split("_");
      answered[Number(index)] = {
        id: itemId,
        inputId: id,
        value,
      };

      const totalAnswered = answered.filter((answer) => !!answer).length;
      elTotalAnsweredSpan.innerHTML = totalAnswered;
      if (totalAnswered === total) {
        elCheckButton.classList.remove("hidden");
      }
    });
  });
}

function clickAnswer(question, answer) {}

function shuffleArray(array) {
  if (!Array.isArray(array)) {
    throw new TypeError("Input must be an array");
  }

  let currentIndex = array.length;

  while (currentIndex !== 0) {
    // Pick a random index
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // Swap elements
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

function resetTest() {}

function checkAnswers(event) {
  event.preventDefault();
  event.stopPropagation();
  console.log("answer", answered);
  let correct = 0;
  answered.forEach((answer) => {
    if (ID_MAP[answer.id].answer === answer.value) {
      correct++;
      document.getElementById(`label_${answer.inputId}`).style.color = "green";
    } else {
      document.getElementById(`label_${answer.inputId}`).style.color = "red";
    }
  });
  const pct = Math.round((correct / total) * 100);
  elResults.innerHTML = `Score ${correct}/${total} (${pct}%)`;
  if (correct === total) {
    elCheckButton.classList.add("hidden");
    elResetButton.classList.remove("hidden");
  }
}

elResetButton.addEventListener("click", start, true);
elCheckButton.addEventListener("click", checkAnswers, true);
