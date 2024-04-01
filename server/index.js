import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { TransformStream } from "node:stream/web";
import { Readable, Transform, Writable } from "node:stream";
import { setTimeout } from "node:timers/promises";

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
});
