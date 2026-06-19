/**
 * Quick fix for the syntax error in messageHandlers.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'ocpp', 'messageHandlers.js');

// Read the file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    return;
  }

  // Make a backup
  fs.writeFileSync(`${filePath}.bak2`, data);
  console.log(`Backup created at ${filePath}.bak2`);

  // Simply replace the problematic line - direct approach
  const fixedContent = data.replace(
    /}: Tag \${normalizedPayload\.idTag} status is \${authResult\.status}`\);/g,
    `logger.warn(\`Rejected transaction start from \${chargePointId}: Tag \${normalizedPayload.idTag} status is \${authResult.status}\`);`
  );

  // Write the fixed content
  fs.writeFile(filePath, fixedContent, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error(`Error writing file: ${writeErr.message}`);
      return;
    }
    console.log('Successfully fixed syntax error');
  });
});
