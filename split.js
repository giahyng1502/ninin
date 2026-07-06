const fs = require('fs');

const htmlContent = fs.readFileSync('www/admin/index.html', 'utf8');
const scriptStartStr = '<script>\n        const API_BASE';
const scriptStartIndex = htmlContent.indexOf(scriptStartStr);
const scriptEndIndex = htmlContent.lastIndexOf('</script>');

if (scriptStartIndex > -1 && scriptEndIndex > scriptStartIndex) {
    const jsContent = htmlContent.substring(scriptStartIndex + 9, scriptEndIndex);
    fs.writeFileSync('www/admin/js/app.js', jsContent);
    const newHtml = htmlContent.substring(0, scriptStartIndex) + '<script src="js/app.js"></script>\n' + htmlContent.substring(scriptEndIndex + 9);
    fs.writeFileSync('www/admin/index.html', newHtml);
    console.log('Successfully split script into js/app.js');
} else {
    console.log('Could not find script bounds');
}
