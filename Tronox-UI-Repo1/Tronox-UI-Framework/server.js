import apminsight from 'apminsight';
apminsight.start({
  serviceName: "tronox-ui-api",
  environment: "production"
});
import express from "express";
import { exec } from "child_process";
import cors from "cors";
import fs from "fs";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import config from "./config/app.config.js";
import userConfig from "./config/user.config.js";
import multer from "multer";
import xlsx from "xlsx";
import path from "path";
import compression from "compression";
import { fileURLToPath } from "url";
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } from "docx";
import { constants as zlibConstants } from 'zlib';
 
const app = express();
const port = 3000;
const HOST = '20.40.46.20';
const DOCUMENTS_FOLDER = "./documents";
const resultsFilePath = "testResults.json";
const eventsFilePath = './userEvents.json';
if (!fs.existsSync(DOCUMENTS_FOLDER)) {
  fs.mkdirSync(DOCUMENTS_FOLDER);
}
// Serve documents folder for downloads
app.use("/documents", express.static(DOCUMENTS_FOLDER));
app.use(cors());
app.use(compression({ flush: zlibConstants.Z_SYNC_FLUSH }));
app.use(bodyParser.json());
// APM slow transaction test
app.get("/slow", async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  res.send("slow");
});

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE_PATH = path.join(__dirname, "testStepsLog.txt");
fs.writeFileSync(LOG_FILE_PATH, "", "utf8"); // Clear on startup
 
// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));
const upload = multer({ dest: "uploads/" });
 
function isEmptyObject(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length === 0;
}
 
// Latest code for GCP- Gayathri
app.get('/get-log', (req, res) => {
  fs.readFile(LOG_FILE_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error("Error reading log file:", err);
      return res.status(500).send("Error reading log file.");
    }
    res.send(data);
  });
});

// Clear log file endpoint
app.post('/clear-log', (req, res) => {
  fs.writeFile(logFilePath, '', 'utf8', (err) => {
    if (err) {
      console.error(' Error clearing log file:', err);
      return res.status(500).json({ message: 'Failed to clear log file' });
    }
    console.log(' testStepsLog.txt cleared');
    res.json({ message: 'Log file cleared successfully' });
  });
});

// Api to capture xpath:
app.post('/log-event', (req, res) => {
  const event = req.body;

  let events = [];
  if (fs.existsSync(eventsFilePath)) {
    events = JSON.parse(fs.readFileSync(eventsFilePath));
  }

  events.push(event);

  fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 2));
  res.status(200).json({ message: 'Event logged successfully' });
});

// Login API to issue JWT token
app.post("/login", (req, res) => {
  const { username, password } = req.body;
 
  if (username === userConfig.username && password === userConfig.password) {
    const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: "3h" });
    return res.json({ message: "Login successful!", token });
  }
 
  return res.status(401).json({ message: "Invalid credentials" });
});
 
// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const bearerHeader = req.headers["authorization"];
 
  if (bearerHeader) {
    const token = bearerHeader.split(" ")[1];
 
    jwt.verify(token, config.jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
      req.user = decoded;
      next();
    });
  } else {
    res.status(403).json({ message: "Token required" });
  }
}
 
function runScript(req, res) {
  exec("npm run wdio", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).send(`Test run failed: ${error.message}`);
    }
 
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return res.status(500).send(`Test run failed with error: ${stderr}`);
    }
 
    console.log(`stdout: ${stdout}`);
    res.send(`Test run completed successfully: ${stdout}`);
  });
}
// app.post("/run-script", (req, res) => {
//   // Run the test case using a child process
//   exec("npx wdio run wdio.conf.js --spec test/specs/Tronox_MTS.e2e.js", (error, stdout, stderr) => {
//     if (error) {
//       console.error(`exec error: ${error}`);
//       return res.status(500).send(`Test run failed: ${error.message}`);
//     }
 
//     if (stderr) {
//       console.error(`stderr: ${stderr}`);
//       return res.status(500).send(`Test run failed with error: ${stderr}`);
//     }
 
//     console.log(`stdout: ${stdout}`);
//     res.send(`Test run completed successfully: ${stdout}`);
//   });
// });
// Route to trigger the test case
app.post("/run-test", (req, res) => {
  // Run the test case using a child process
  runScript(req, res);
});
 
// Load tiles from JSON file
app.get("/api/tiles", verifyToken, (req, res) => {
  try {
    //config\config.json
    //C:\Tronox-UI-Repo\Tronox-UI-Framework\config\config.json
    const tileData = JSON.parse(
      fs.readFileSync("./config/tiles.json", "utf-8")
    );
    res.json(tileData);
  } catch (error) {
    res.status(500).json({ message: "Error loading tile data" });
  }
});
let testScriptName = "";
const logFilePath = './testStepsLog.txt';
app.post("/testcase-exec", verifyToken, upload.single("file"), (req, res) => {
  fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');
  // lastReadPosition = 0;
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
 
  const { testName } = req.body; // Get the test name from the frontend
  testScriptName = testName;
  if (!testName) {
    res.write("Error: No test name provided\n");
    return res.end();
  }
 
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0]; // Read first sheet
    const sheet = workbook.Sheets[sheetName];
 
    // Read merged cells information
    const mergedCells = sheet["!merges"] || [];
    console.log(mergedCells.length);
    const jsonData = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    });
 
    // Process merged cells to create hierarchy
    const result = {};
    const processedColumns = new Set();
    const rowMergedMap = {}; // Track row-merged cells
 
    mergedCells.forEach((merge) => {
      const parentCell = jsonData[merge.s.r][merge.s.c];
      const childData = {};
      var r = "";
      for (let col = merge.s.c; col <= merge.e.c; col++) {
        const key = jsonData[merge.s.r + 1]?.[col]; // Get column headers
        const value = jsonData[merge.s.r + 2]?.[col]; // Get corresponding values
 
        r = value;
 
        if (key) {
          childData[key] = value !== undefined ? value : null;
          processedColumns.add(col); // Mark as processed
        }
      }
 
      if (isEmptyObject(childData)) {
        result[parentCell] = r;
      } else {
        result[parentCell] = childData;
      }
    });
 
    //  Handle non-merged columns and row-merged values
    if (mergedCells.length == 0) {
      const headers = jsonData[0] || [];
      const values = jsonData[1] || [];
      headers.forEach((header, index) => {
        if (header && !processedColumns.has(index)) {
          const value =
            values[index] !== undefined
              ? values[index]
              : rowMergedMap[2] || null;
          result[header] = value;
        }
      });
    }
    // Cleanup uploaded file
    fs.unlinkSync(req.file.path);
    const jsonString = JSON.stringify(result, null, 2);
    const path = "./test/Data/Tronox/Physicalinventory.json";
    fs.writeFile(path, jsonString, "utf8", (err) => {
      if (err) {
        console.error("Error writing to file:", err);
      } else {
        console.log("File successfully overwritten!");
        const testSpecPath = `./test/specs/${testName}.js`;
        const command = `npx wdio run ./wdio.conf.js --spec ${testSpecPath}`;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send(`Test run failed: ${error.message}`);
          }
 
          if (stderr) {
            console.error(`stderr: ${stderr}`);
            return res
              .status(500)
              .send(`Test run failed with error: ${stderr}`);
          }
 
          console.log(`stdout: ${stdout}`);
          res.send(`Test run completed successfully: ${stdout}`);
        });
      }
    });
 
    // res.json(result);
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Error processing file" });
  }
});
 
// app.get("/realtime", (req, res) => {
//   res.setHeader("Content-Type", "text/plain");
//   res.setHeader("Transfer-Encoding", "chunked");
 
//   let count = 0;
 
//   const sendData = () => {
//       count++;
//       res.write(`Message ${count}: This is update ${count}\n`);
//       res.flush?.(); // Flush the response buffer if supported
 
//       if (count === 5) {
//           clearInterval(interval);
//           res.write("Done!\n");
//           res.end();
//       }
//   };
 
//   sendData(); // Send first message immediately
//   const interval = setInterval(sendData, 2000);
// });
 
app.post(
  "/realtime-testcase-exec",
  verifyToken,
  upload.single("file"),
  (req, res) => {
    // fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');
    // lastReadPosition = 0;
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");
 
    if (!req.file) {
      res.write("Error: No file uploaded\n");
      return res.end();
    }
 
    const { testName } = req.body; // Get the test name from the frontend
 
    if (!testName) {
      res.write("Error: No test name provided\n");
      return res.end();
    }
 
    try {
      res.write("Processing uploaded file...\n");
 
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
 
      const mergedCells = sheet["!merges"] || [];
      res.write(`Found ${mergedCells.length} merged cells.\n`);
 
      const jsonData = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
      });
      const result = {};
      const processedColumns = new Set();
 
      mergedCells.forEach((merge) => {
        const parentCell = jsonData[merge.s.r][merge.s.c];
        const childData = {};
        let r = "";
 
        for (let col = merge.s.c; col <= merge.e.c; col++) {
          const key = jsonData[merge.s.r + 1]?.[col];
          const value = jsonData[merge.s.r + 2]?.[col];
          r = value;
 
          if (key) {
            childData[key] = value !== undefined ? value : null;
            processedColumns.add(col);
          }
        }
 
        result[parentCell] = isEmptyObject(childData) ? r : childData;
      });
 
      if (mergedCells.length === 0) {
        const headers = jsonData[0] || [];
        const values = jsonData[1] || [];
        headers.forEach((header, index) => {
          if (header && !processedColumns.has(index)) {
            result[header] = values[index] ?? null;
          }
        });
      }
 
      fs.unlinkSync(req.file.path);
      res.write("File processing completed.\n");
 
      const jsonString = JSON.stringify(result, null, 2);
      const filePath =
        "C:\\Tronox-UI-Repo\\Tronox-UI-Framework\\test\\Data\\Tronox\\Physicalinventory.json";
      res.write("\n");
      res.write(jsonString);
      res.write("\n");
 
      fs.writeFile(filePath, jsonString, "utf8", (err) => {
        if (err) {
          res.write(`Error writing to file: ${err.message}\n`);
          return res.end();
        }
 
        res.write("File successfully written. Starting test execution...\n");
 
        // Construct the dynamic command using the test name from the frontend
        const testSpecPath = `./test/specs/${testName}.js`;
        const command = `npx wdio run ./wdio.conf.js --spec ${testSpecPath}`;
 
        res.write(`Executing command: ${command}\n`);
 
        const testProcess = exec(command);
 
        testProcess.stdout.on("data", (data) => {
          res.write(`Test Output: ${data}`);
        });
 
        testProcess.stderr.on("data", (data) => {
          res.write(`Test Error: ${data}`);
        });
 
        testProcess.on("close", (code) => {
          res.write(`Test execution completed with exit code ${code}.\n`);
          res.end();
        });
      });
    } catch (error) {
      res.write(`Error processing file: ${error.message}\n`);
      res.end();
    }
  }
);
 
// app.post("/testcase-results", verifyToken, async (req, res) => {
//   const rawData = fs.readFileSync(resultsFilePath, "utf-8");
//   const testResults = JSON.parse(rawData);
 
//   const updatedResults = await Promise.all(
//     testResults.map(async (test) => {
//       const docFileName = `${test.Testname.replace(/\s+/g, "_")}.docx`;
//       const docFilePath = path.join(DOCUMENTS_FOLDER, docFileName);
//       const docDownloadURL = `http://localhost:${port}/documents/${docFileName}`;
 
//       // Create Word Document
//       const doc = new Document({
//         sections: [
//           {
//             properties: {},
//             children: [
//               new Paragraph({
//                 text: docFileName+test.Testname,
//                 heading: "Heading1",
//               }),
//               ...test.screenshots.map((screenshot) =>
//                 fs.existsSync(screenshot)
//                   ? new Paragraph({
//                       children: [
//                         new ImageRun({
//                           data: fs.readFileSync(screenshot),
//                           transformation: { width: 500, height: 300 },
//                         }),
//                         new TextRun("\n"),
//                       ],
//                     })
//                   : new Paragraph(`Image not found: ${screenshot}`)
//               ),
//             ],
//           },
//         ],
//       });
 
//       // Save the document
//       const buffer = await Packer.toBuffer(doc);
//       fs.writeFileSync(docFilePath, buffer);
 
//       // Add document URL to test result
//       return { ...test, documentUrl: docDownloadURL };
//     })
//   );
 
//   res.json(updatedResults);
// });
 
// Gayatri code
// app.post("/testcase-results", verifyToken, async (req, res) => {
//   const rawData = fs.readFileSync(resultsFilePath, "utf-8");
//   const testResults = JSON.parse(rawData);
 
//   const updatedResults = await Promise.all(
//     testResults.map(async (test) => {
//       const docFileName = `${test.Testname.replace(/\s+/g, "_")}.docx`;
//       const docFilePath = path.join(DOCUMENTS_FOLDER, docFileName);
//       const docDownloadURL = `http://localhost:${port}/documents/${docFileName}`;
//       const currentDateTime = new Date().toLocaleString();
//       console.log(currentDateTime + " " + test.status + " " + test.error);
//       console.log(testScriptName);
 
//       // Create Word Document with styling
//       const doc = new Document({
//         sections: [
//           {
//             properties: {},
//             children: [
//               new Paragraph({
//                 text: `${test.Testname} - ${testScriptName}`,
//                 heading: "Heading1",
//                 alignment: AlignmentType.CENTER, // Fixed alignment issue here
//                 style: "Heading1",
//               }),
//               new Paragraph({
//                 children: [
//                   new TextRun({ text: `Tester Name: ${userConfig.username}`, bold: true, color: "0000FF" }), // Blue, bold
//                 ],
//                 spacing: { after: 200 }, // Add spacing after paragraph
//               }),
//               new Paragraph({
//                 children: [
//                   new TextRun({ text: `Execution Status: ${test.status}`, underline: true, color: "FF6347" }), // Tomato color, underlined
//                 ],
//                 spacing: { after: 200 },
//               }),
//               new Paragraph({
//                 children: [
//                   new TextRun({ text: `Test File Name: ${test.testFileName}`, bold: true, font: "Times New Roman", size: 20 }), // Bold, Times New Roman, size 20
//                 ],
//                 spacing: { after: 200 },
//               }),
//               test.executionStatus === "Failed" && test.errorMessage
//                 ? new Paragraph({
//                     children: [
//                       new TextRun({
//                         text: `Error Message: ${test.error}`,
//                         color: "FF0000", // Red color for error message
//                         bold: true,
//                       }),
//                     ],
//                     spacing: { after: 200 },
//                   })
//                 : new Paragraph({ text: "" }),
//               new Paragraph({
//                 children: [
//                   new TextRun({ text: `Execution Date & Time: ${currentDateTime}`, font: "Verdana", size: 18 }), // Verdana font, size 18
//                 ],
//                 spacing: { after: 200 },
//               }),
//               ...test.screenshots.map((screenshot) =>
//                 fs.existsSync(screenshot)
//                   ? new Paragraph({
//                       children: [
//                         new ImageRun({
//                           data: fs.readFileSync(screenshot),
//                           transformation: { width: 500, height: 300 },
//                         }),
//                         new TextRun("\n"),
//                       ],
//                     })
//                   : new Paragraph({ text: `Image not found: ${screenshot}`, color: "FF0000" }) // Red text if image is not found
//               ),
//             ],
//           },
//         ],
//       });
 
//       // Save the document
//       const buffer = await Packer.toBuffer(doc);
//       fs.writeFileSync(docFilePath, buffer);
 
//       // Add document URL and execution details to test result
//       return {
//         ...test,
//         documentUrl: docDownloadURL,
//         executionDateTime: currentDateTime,
//       };
//     })
//   );
 
//   res.json(updatedResults);
// });
 
// Gayatri code
 
app.post("/testcase-results", verifyToken, async (req, res) => {
  // fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');
  // lastReadPosition = 0;
  const rawData = fs.readFileSync(resultsFilePath, "utf-8");
  const testResults = JSON.parse(rawData);

 
  const updatedResults = await Promise.all(
    testResults.map(async (test) => {
      const docFileName = `${test.Testname.replace(/\s+/g, "_")}.docx`;
      const docFilePath = path.join(DOCUMENTS_FOLDER, docFileName);
      const docDownloadURL = `http://35.244.54.64:${port}/documents/${docFileName}`;
      const currentDateTime = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
      console.log(currentDateTime + " " + test.status + " " + test.error);
      console.log(testScriptName);
      console.log("Execution Status:", test);
      console.log("Error Step:", test?.errorstep);
 
      // Create Word Document with styling
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: `${test.Testname} - ${testScriptName}`,
                heading: "Heading1",
                alignment: AlignmentType.CENTER, // Fixed alignment issue here
                style: "Heading1",
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Tester Name: ${userConfig.username}`, bold: true, color: "0000FF" }), // Blue, bold
                ],
                spacing: { after: 200 }, // Add spacing after paragraph
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Execution Status `, underline: true, color: "000000" }),
                  new TextRun({ text: `${test.status}`, bold: true, color: "008000" }), // Tomato color, underlined
                ],
                spacing: { after: 200 },
              }),
              // new Paragraph({
              //   children: [
              //     new TextRun({ text: `Execution Time: ${test.executionTime} seconds`, italics: true, font: "Arial", size: 24 }), // Italic, Arial font, size 24
              //   ],
              //   spacing: { after: 200 },
              // }),
              // new Paragraph({
              //   children: [
              //     new TextRun({ text: `Test File Name: ${test.testFileName}`, bold: true, font: "Times New Roman", size: 20 }), // Bold, Times New Roman, size 20
              //   ],
              //   spacing: { after: 200 },
              // }),
              test.status == "failed"
                ? new Paragraph({
                    children: [
                     new TextRun({
                        text: `Error Message: `,
                        underline: true, color: "000000"
                      }),
                      new TextRun({
                        text: `${test.error}`,
                        color: "FF0000", // Red color for error message
                        bold: true,
                      }),
                    ],
                    spacing: { after: 200 },
                  })
                : new Paragraph({ text: "" }),
                test.status == "failed"
                ? new Paragraph({
                    children: [
                     new TextRun({
                        text: `Error Step: `,
                        underline: true, color: "000000"
                      }),
                      new TextRun({
                        text: `${test.errorstep}`,
                        color: "FF0000", // Red color for error message
                        bold: true,
                      }),
                    ],
                    spacing: { after: 200 },
                  })
                : new Paragraph({ text: "" }),
                
              new Paragraph({
                children: [
                  new TextRun({ text: `Execution Date & Time: ${currentDateTime}`, font: "Verdana", size: 18 }), // Verdana font, size 18
                ],
                spacing: { after: 200 },
              }),
              ...test.screenshots.map((screenshot) =>
                fs.existsSync(screenshot)
                  ? new Paragraph({
                      children: [
                        new ImageRun({
                          data: fs.readFileSync(screenshot),
                          transformation: { width: 500, height: 300 },
                        }),
                        new TextRun("\n"),
                      ],
                    })
                  : new Paragraph({ text: `Image not found: ${screenshot}`, color: "FF0000" }) // Red text if image is not found
              ),
            ],
          },
        ],
      });
 
      // Save the document
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(docFilePath, buffer);
 
      // Add document URL and execution details to test result
      return {
        ...test,
        documentUrl: docDownloadURL,
        executionDateTime: currentDateTime,
      };
    })
  );
 
  res.json(updatedResults);
});
 
//  Code end Gayatri
 
// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});;
 
