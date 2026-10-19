process.env.OPEN_CABINET = '1';
if (!process.env.PORT) process.env.PORT = '8080';
require('./server.js');
