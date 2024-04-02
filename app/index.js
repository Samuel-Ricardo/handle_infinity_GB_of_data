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
        if (!item.lenght) continue;

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

function appendToHtml(element) {
  let counter = 0;
  let elementCounter = 0;

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

      if (++elementCounter > 20) {
        element.innerHTML = card;
        elementCounter = 0;
        return;
      }

      element.innerHTML += card;
    },

    abort(reason) {
      console.log("Aborted", { reason });
    },
  });
}
