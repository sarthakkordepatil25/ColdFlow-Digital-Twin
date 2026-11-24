package coldflow.server;

import coldflow.*;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Embedded HTTP server hosting the ColdFlow REST API and 3D WebGL Digital Twin assets.
 *
 * Runs locally on 127.0.0.1:8080 with zero third-party web framework dependencies.
 */
public class ColdFlowServer {

    public static final int DEFAULT_PORT = 8080;
    private final int port;
    private final FreezerZone freezer;
    private final ChillerZone chiller;
    private final AmbientZone ambient;
    private final InventoryManager inventory;
    private final Path staticFilesRoot;

    private HttpServer server;
    private ScheduledExecutorService simulationScheduler;

    public ColdFlowServer(int port, FreezerZone freezer, ChillerZone chiller,
                          AmbientZone ambient, InventoryManager inventory) {
        this.port = port;
        this.freezer = freezer;
        this.chiller = chiller;
        this.ambient = ambient;
        this.inventory = inventory;
        this.staticFilesRoot = Paths.get("web", "twin").toAbsolutePath();
    }

    public synchronized void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());

        Runnable shutdownAction = this::stop;

        // API Handler
        ColdFlowApiHandler apiHandler = new ColdFlowApiHandler(
                freezer, chiller, ambient, inventory, shutdownAction
        );
        server.createContext("/api", apiHandler);

        // Static Web Asset Handler
        server.createContext("/", new StaticFileHandler(staticFilesRoot));

        server.start();
        System.out.println("==================================================");
        System.out.printf(" ColdFlow Server listening on http://127.0.0.1:%d%n", port);
        System.out.printf(" Static web assets: %s%n", staticFilesRoot);
        System.out.println("==================================================");

        // Start background autonomous warehouse simulation (runs cycles every 3 seconds)
        simulationScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "ColdFlow-Simulation-Loop");
            t.setDaemon(true);
            return t;
        });

        simulationScheduler.scheduleAtFixedRate(() -> {
            try {
                freezer.runCycle();
                chiller.runCycle();
                ambient.runCycle();
            } catch (Exception ex) {
                System.err.println("Simulation cycle error: " + ex.getMessage());
            }
        }, 3, 3, TimeUnit.SECONDS);
    }

    public synchronized void stop() {
        System.out.println("\nShutting down ColdFlow Server...");
        if (simulationScheduler != null && !simulationScheduler.isShutdown()) {
            simulationScheduler.shutdownNow();
        }
        if (server != null) {
            server.stop(1);
        }
        System.out.println("ColdFlow Server stopped cleanly.");
    }

    /**
     * Serves HTML, CSS, JS, textures, and 3D models securely from web/twin/.
     */
    static class StaticFileHandler implements HttpHandler {
        private final Path rootDir;

        public StaticFileHandler(Path rootDir) {
            this.rootDir = rootDir;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String pathStr = exchange.getRequestURI().getPath();
            if (pathStr.equals("/") || pathStr.isEmpty()) {
                pathStr = "/index.html";
            }

            // Security: Prevent directory traversal
            Path resolved = rootDir.resolve(pathStr.startsWith("/") ? pathStr.substring(1) : pathStr).normalize();
            if (!resolved.startsWith(rootDir) || !Files.exists(resolved) || Files.isDirectory(resolved)) {
                String notFound = "404 Not Found: " + pathStr;
                exchange.sendResponseHeaders(404, notFound.length());
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(notFound.getBytes());
                }
                return;
            }

            String contentType = getContentType(resolved.getFileName().toString());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");

            byte[] bytes = Files.readAllBytes(resolved);
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }

        private String getContentType(String filename) {
            String lower = filename.toLowerCase();
            if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=UTF-8";
            if (lower.endsWith(".css")) return "text/css; charset=UTF-8";
            if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=UTF-8";
            if (lower.endsWith(".json")) return "application/json; charset=UTF-8";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".ico")) return "image/x-icon";
            if (lower.endsWith(".glb") || lower.endsWith(".gltf")) return "model/gltf-binary";
            if (lower.endsWith(".bin")) return "application/octet-stream";
            return "application/octet-stream";
        }
    }
}
