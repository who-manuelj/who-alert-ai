const runEmbeddingSearch = (queryText) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve("embeddings/generate_embeddings.py");

    const pythonProcess = spawn("python", [scriptPath, queryText]);

    let result = "";
    let error = "";

    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0 || error) {
        return reject(
          new Error(error || `Python script exited with code ${code}`)
        );
      }

      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch (err) {
        reject(new Error("Failed to parse JSON from Python output"));
      }
    });
  });
};
