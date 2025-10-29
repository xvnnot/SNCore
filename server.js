import { createServer } from 'net';
import { ConfigLoader } from './lib/ConfigLoader.js';
import { RequestHandler } from './lib/RequestHandler.js';
import { VirtualHost } from './lib/VirtualHost.js';

class SimpleWebServer {
  constructor() {
    this.configLoader = new ConfigLoader();
    this.requestHandler = new RequestHandler(this.configLoader);
    this.server = null;
  }

  async initialize() {
    try {
      this.configLoader.load();
      this.serverConfig = this.configLoader.getServerConfig();
      
      this.server = createServer((socket) => {
        this.handleConnection(socket);
      });

      this.setupErrorHandling();
      
    } catch (error) {
      console.error('Ошибка инициализации:', error.message);
      process.exit(1);
    }
  }

  handleConnection(socket) {
    let requestData = '';
    
    socket.on('data', (data) => {
      requestData += data.toString();
      
      if (requestData.includes('\r\n\r\n')) {
        this.processRequest(socket, requestData);
        requestData = '';
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error.message);
    });
  }

  processRequest(socket, rawRequest) {
    try {
      const request = this.requestHandler.parseRequest(rawRequest);
      const hostConfig = this.configLoader.getSiteByHostname(request.host);
      const virtualHost = new VirtualHost(hostConfig);

      let fileResult;

      if (request.method !== 'GET') {
        fileResult = virtualHost.serveErrorPage(405, 'Method Not Allowed');
      } else {
        const filePath = virtualHost.resolveFilePath(request.url);
        
        if (!filePath) {
          fileResult = virtualHost.serveErrorPage(404);
        } else {
          try {
            fileResult = virtualHost.serveFile(filePath);
          } catch (error) {
            console.error(`Error serving file ${filePath}:`, error);
            fileResult = virtualHost.serveErrorPage(500, error.message);
          }
        }
      }

      const response = this.requestHandler.buildResponse(request, fileResult, virtualHost);
      socket.write(response);
      
      this.requestHandler.logRequest(request, fileResult.statusCode);
      
    } catch (error) {
      console.error('Error processing request:', error);
      const errorResponse = `HTTP/1.1 500 Internal Server Error\r\n\r\nServer Error`;
      socket.write(errorResponse);
    } finally {
      socket.end();
    }
  }

  setupErrorHandling() {
    process.on('SIGINT', () => {
      console.log('\nОстанавливаем сервер...');
      this.stop();
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  start() {
    this.server.listen(this.serverConfig.port, this.serverConfig.host, () => {
      console.log('\nSimpleWebServer запущен!');
      console.log(`Адрес: http://${this.serverConfig.host}:${this.serverConfig.port}`);
      console.log('\nДоступные сайты:');
      
      Object.entries(this.configLoader.getAllSites()).forEach(([name, config]) => {
        console.log(`   • http://${config.hostname}:${this.serverConfig.port} (${name})`);
      });
      
      console.log('\nЛоги запросов:', this.serverConfig.log_requests ? 'включены' : 'выключены');
      console.log('Нажмите Ctrl+C для остановки\n');
    });
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('Сервер остановлен');
        process.exit(0);
      });
    }
  }
}

const webServer = new SimpleWebServer();
await webServer.initialize();
webServer.start();