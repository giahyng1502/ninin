const fs = require('fs');

const htmlContent = fs.readFileSync('www/admin/index.html', 'utf8');
const styleStartIndex = htmlContent.indexOf('<style>');
const styleEndIndex = htmlContent.indexOf('</style>');

if (styleStartIndex > -1 && styleEndIndex > styleStartIndex) {
    const cssContent = htmlContent.substring(styleStartIndex + 7, styleEndIndex);
    fs.mkdirSync('www/admin/assets', { recursive: true });
    fs.writeFileSync('www/admin/assets/style.css', cssContent);
    const newHtml = htmlContent.substring(0, styleStartIndex) + '<link rel="stylesheet" href="assets/style.css">\n' + htmlContent.substring(styleEndIndex + 8);
    fs.writeFileSync('www/admin/index.html', newHtml);
    console.log('Successfully split CSS into assets/style.css');
} else {
    console.log('Could not find style bounds');
}
