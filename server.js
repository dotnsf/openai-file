import dotenv from "dotenv";
dotenv.config();

/* __dirname の定義 */
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";

const app = express();

const port = Number.parseInt(process.env.PORT || "3000", 10);
const corsEnabled = ( process.env.CORS ? true : false );
const maxFileSize = Number.parseInt(
  process.env.MAX_FILE_SIZE || String(20 * 1024 * 1024),
  10
);

if (!process.env.API_KEY) {
  console.error("Environment variable API_KEY is not set.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.API_KEY
});


/*
 * ファイルはディスクに保存せず、メモリ上に保持する。
 *
 * MAX_FILE_SIZE を指定しなかった場合は20 MiBに制限する。
 * これはこのExpress API側の防御的な制限であり、
 * OpenAI API自体の制限値を表すものではない。
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: maxFileSize
  }
});

/*
 * CORS=true の場合だけCORSヘッダーを追加する。
 *
 * multipart/form-dataによるPOSTは、リクエスト条件によって
 * OPTIONSプリフライトが発生する場合があるため、
 * OPTIONSリクエストにも対応する。
 */
app.use((req, res, next) => {
  if (corsEnabled) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* Swagger UI */
app.use(
  express.static(path.join(__dirname, "public"))
);

/* モデル関連 */
app.get( '/api/models', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var result = await openai.models.list();
  //console.log( {result.data} );
  res.write( JSON.stringify( { status: true, result: result.data }, null, 2 ) );
  res.end();
});

app.get( '/api/model/:id', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var id = req.params.id;
  var result = await openai.models.retrieve( id );
  res.write( JSON.stringify( { status: true, result: result.data }, null, 2 ) );
  res.end();
});

app.post("/api/completion", (req, res) => {
  upload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return handleUploadError(uploadError, res);
    }

    try {
      const prompt =
        typeof req.body.prompt === "string"
          ? req.body.prompt.trim()
          : "";
      const previousResponseId =
        typeof req.body.previous_response_id === "string"
          ? req.body.previous_response_id.trim()
          : "";


      if (!prompt) {
        return res.status(400).json({
          error: {
            type: "invalid_request",
            message:
              'The multipart/form-data field "prompt" is required.'
          }
        });
      }

      let request;

      if (req.file) {
        request = createRequestWithFile(prompt, req.file, previousResponseId);
      } else {
        request = createTextOnlyRequest(prompt, previousResponseId);
      }

      const response = await openai.responses.create(request);

      if (req.file) {
        fs.unlinkSync( req.file.path );
      }

      /*
       * OpenAI SDKが返したResponses APIのレスポンスオブジェクトを
       * 抽出・変換せず、そのままJSONとして返す。
       */
      return res
        .status(200)
        .type("application/json")
        .send(JSON.stringify(response));
    } catch (error) {
      return handleOpenAIError(error, res);
    }
  });
});

function createTextOnlyRequest(prompt, previousResponseId) {
  const request = {
    model: "gpt-5-mini",
    tools: [
      { type: "web_search" }
    ],
    input: prompt,
    store: true
  };
  if( previousResponseId ) {
    request.previous_response_id = previousResponseId;
  }

  return request;
}

function createRequestWithFile(prompt, file, previousResponseId) {
  const mimeType = file.mimetype || "application/octet-stream";
  const base64Data = file.buffer.toString("base64");

  const request = {
    model: "gpt-5-mini",
    tools: [
      { type: "web_search" }
    ],
    input: [
        {
            role: "user",
            content: [
                {
                    type: "input_file",
                    filename: file.originalname,
                    file_data: `data:${mimeType};base64,${base64Data}`  
                },
                {
                    type: "input_text",
                    text: prompt
                }
            ]
        }
    ],
    store: true
  };
  if( previousResponseId ) {
    request.previous_response_id = previousResponseId;
  }

  return request;
}

function handleUploadError(error, res) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: {
          type: "file_too_large",
          message: `The uploaded file exceeds the limit of ${maxFileSize} bytes.`
        }
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: {
          type: "unexpected_file",
          message:
            'Only one file with the multipart field name "file" is accepted.'
        }
      });
    }

    return res.status(400).json({
      error: {
        type: "multipart_error",
        message: error.message,
        code: error.code
      }
    });
  }

  console.error("File upload error:", error);

  return res.status(500).json({
    error: {
      type: "internal_server_error",
      message: "Failed to process the uploaded file."
    }
  });
}

function handleOpenAIError(error, res) {
  console.error("OpenAI API error:", error);

  /*
   * OpenAI SDKのAPIエラーには、statusやerrorプロパティが含まれる
   * 場合がある。利用可能ならそのHTTPステータスを維持する。
   */
  const status =
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  if (error?.error && typeof error.error === "object") {
    return res.status(status).json({
      error: error.error
    });
  }

  return res.status(status).json({
    error: {
      type: "openai_api_error",
      message: error?.message || "OpenAI API request failed."
    }
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: {
      type: "not_found",
      message: "The requested API endpoint was not found."
    }
  });
});

app.listen(port, () => {
  console.log(`API server is listening on port ${port}`);
  console.log(`CORS: ${corsEnabled ? "enabled" : "disabled"}`);
  console.log(`Maximum file size: ${maxFileSize} bytes`);
});

