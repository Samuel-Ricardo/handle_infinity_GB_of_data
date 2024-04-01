import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { TransformStream } from "node:stream/web";
import { Readable, Transform, Writable } from "node:stream";
import { setTimeout } from "node:timers/promises";

import byteSize from "byte-size";
import csvtojson from "csvtojson";
import { title } from "node:process";

const PORT = 3000;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
};

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  let counter = 0;

  const filename = "./data/archive.zip";
  const { size } = await stat(filename);

  console.log(`Processing ${byteSize(size)}`);

  try {
    response.writeHead(200, headers);
    const abortController = new AbortController();

    request.once("close", (_) => {
      console.log("Connection was closed :()", counter);
      abortController.abort();
    });

    await Readable.toWeb(createReadStream(filename))
      .pipeThrough(
        Transform.toWeb(
          csvtojson({ headers: ["title", "description", "url_anime"] }),
        ),
      )
      .pipeThrough(
        new TransformStream({
          async transform(jsonLine, controller) {
            const data = JSON.parse(Buffer.from(jsonLine));
            const mappedData = JSON.stringify({
              title: data.title,
              description: data.description,
              url_anime: data.url_anime,
            });
            counter++;
            controller.enqueue(mappedData.concat("\n"));
          },
        }),
      )
      .pipeTo(Writable.toWeb(response), { signal: abortController.signal });
  } catch (error) {
    console.error(error);
  }
});
