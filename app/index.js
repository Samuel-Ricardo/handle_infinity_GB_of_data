const API_URL = "http://localhost:3000";

async function consumeAPI(signal) {
  console.log("Consuming API", { signal });

  const response = await fetch(API_URL, { signal });

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(parseNDJSON());

  return reader;
}

function parseNDJSON() {
  return new TransformStream({
    transform(chunk, controller) {
      for (const item of chunk.split("\n")) {
        if (!item.length) continue;

        try {
          controller.enqueue(JSON.parse(item));
        } catch (error) {
          controller.error(error);
          // this exception is a common problem that we won't handle in this class:
          // if the arrived data is not completed, it should be stored in memory
          // until completed
          // 1st msg received - {"name": "sa"
          // 2st msg received - "muel"}\n
          // result           {"name": "samuel"}\n
        }
      }
    },
  });
}

let counter = 0;
let elementCounter = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendToHtml(element) {
  return new WritableStream({
    write({ title, description, url }) {
      const card = `
      <article>
        <div class="text">
          <h3>[${++counter}] ${title}</h3>
          <p>${description.slice(0, 100)}</p>
          <a href="${url}">Here's why</a>
        </div>
      </article>
      `;

      /* limit the number of elements rendered on the screen at once 
      if (++elementCounter > 20) {
        element.innerHTML = card;
        elementCounter = 0;
        return;
      }
      */

      sleep(1000).then(() => (element.innerHTML += card));
    },

    abort(reason) {
      console.log("Aborted", { reason });
    },
  });
}

const [start, stop_btn, cards] = ["start", "stop", "cards"].map((id) =>
  document.getElementById(id),
);

let abortController = new AbortController();

start.addEventListener("click", async () => {
  try {
    const reader = await consumeAPI(abortController.signal);
    reader.pipeTo(appendToHtml(cards), {
      signal: abortController.signal,
    });
  } catch (error) {
    console.error({ error });
    if (!error.message.includes("abort")) throw error;
  }
});

stop_btn.addEventListener("click", () => {
  abortController.abort();
  console.log("Aborting...", { signal: abortController.signal });
  abortController = new AbortController();
});
