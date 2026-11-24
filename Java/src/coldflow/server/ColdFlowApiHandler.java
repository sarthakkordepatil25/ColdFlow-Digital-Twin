package coldflow.server;

import coldflow.*;
import coldflow.database.*;
import com.google.gson.*;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Robust JSON REST API Handler for ColdFlow Unified 3D Digital Twin.
 *
 * Uses Google Gson for strict serialization and deserialization.
 * Enforces input validation, parameterized queries, and defensive exception handling.
 */
public class ColdFlowApiHandler implements HttpHandler {

    private final FreezerZone freezer;
    private final ChillerZone chiller;
    private final AmbientZone ambient;
    private final InventoryManager inventory;
    private final SensorDatasetRepository sensorRepo;
    private final Gson gson;
    private final Runnable shutdownCallback;

    public ColdFlowApiHandler(FreezerZone freezer, ChillerZone chiller, AmbientZone ambient,
                              InventoryManager inventory, Runnable shutdownCallback) {
        this.freezer = freezer;
        this.chiller = chiller;
        this.ambient = ambient;
        this.inventory = inventory;
        this.sensorRepo = new SensorDatasetRepository();
        this.gson = new GsonBuilder()
                .registerTypeAdapter(LocalDate.class, (JsonSerializer<LocalDate>) (src, type, ctx) -> new JsonPrimitive(src.toString()))
                .registerTypeAdapter(LocalDate.class, (JsonDeserializer<LocalDate>) (json, type, ctx) -> LocalDate.parse(json.getAsString()))
                .registerTypeAdapter(LocalDateTime.class, (JsonSerializer<LocalDateTime>) (src, type, ctx) -> new JsonPrimitive(src.toString()))
                .registerTypeAdapter(LocalDateTime.class, (JsonDeserializer<LocalDateTime>) (json, type, ctx) -> LocalDateTime.parse(json.getAsString()))
                .setPrettyPrinting()
                .create();
        this.shutdownCallback = shutdownCallback;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
        String path = exchange.getRequestURI().getPath();

        // Enable CORS for local integration
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equals(method)) {
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        try {
            switch (path) {
                case "/api/health":
                    handleHealth(exchange);
                    break;
                case "/api/zones":
                    handleZones(exchange);
                    break;
                case "/api/simulation/cycle":
                    handleSimulationCycle(exchange);
                    break;
                case "/api/inventory":
                    if ("GET".equals(method)) {
                        handleGetInventory(exchange);
                    } else if ("POST".equals(method)) {
                        handleAddBatch(exchange);
                    } else {
                        sendError(exchange, 405, "Method not allowed");
                    }
                    break;
                case "/api/inventory/dispatch":
                    handleDispatchBatch(exchange);
                    break;
                case "/api/inventory/update":
                    handleUpdateQuantity(exchange);
                    break;
                case "/api/inventory/delete":
                    handleDeleteBatch(exchange);
                    break;
                case "/api/sensors/summary":
                    handleSensorSummary(exchange);
                    break;
                case "/api/sensors/downsampled":
                    handleSensorDownsampled(exchange);
                    break;
                case "/api/sensors/paginated":
                    handleSensorPaginated(exchange);
                    break;
                case "/api/sensors/anomalies":
                    handleSensorAnomalies(exchange);
                    break;
                case "/api/heartbeat":
                    handleHeartbeat(exchange);
                    break;
                case "/api/shutdown":
                    handleShutdown(exchange);
                    break;
                default:
                    sendError(exchange, 404, "API endpoint not found: " + path);
                    break;
            }
        } catch (Exception ex) {
            ex.printStackTrace();
            sendError(exchange, 500, "Internal Server Error: " + ex.getMessage());
        }
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("status", "ONLINE");
        health.put("timestamp", System.currentTimeMillis());
        health.put("cppEngineMode", CppBridge.getExecutionMode());
        health.put("batchCount", inventory.getBatchCount());

        boolean dbOk = false;
        try (var con = DatabaseManager.getConnection()) {
            dbOk = con.isValid(3);
        } catch (Exception ignored) {}
        health.put("databaseConnected", dbOk);

        sendJsonResponse(exchange, 200, health);
    }

    private void handleZones(HttpExchange exchange) throws IOException {
        List<Map<String, Object>> zoneList = new ArrayList<>();
        zoneList.add(getZoneData(freezer));
        zoneList.add(getZoneData(chiller));
        zoneList.add(getZoneData(ambient));
        sendJsonResponse(exchange, 200, zoneList);
    }

    private Map<String, Object> getZoneData(StorageZone zone) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("zoneName", zone.getZoneName());
        data.put("targetTemperature", zone.getTargetTemperature());
        data.put("currentTemperature", zone.getCurrentTemperature());
        data.put("status", zone.getStatus());
        data.put("compressorOn", zone.isCompressorOn());
        data.put("temperatureSafe", zone.isTemperatureSafe());

        // COA Registers
        RegisterBank reg = zone.getRegisters();
        Map<String, Object> regMap = new LinkedHashMap<>();
        regMap.put("R0_Target", reg.getR0());
        regMap.put("R1_Current", reg.getR1());
        regMap.put("R2_Error", reg.getR2());
        regMap.put("R3_ControlStatus", reg.getR3());
        regMap.put("R4_EnergyKWh", Math.round(reg.getR4() * 100.0) / 100.0);
        data.put("registers", regMap);

        return data;
    }

    private void handleSimulationCycle(HttpExchange exchange) throws IOException {
        freezer.runCycle();
        chiller.runCycle();
        ambient.runCycle();
        handleZones(exchange);
    }

    private void handleGetInventory(HttpExchange exchange) throws IOException {
        List<Batch> batches = inventory.getAllBatches();
        sendJsonResponse(exchange, 200, batches);
    }

    private void handleAddBatch(HttpExchange exchange) throws IOException {
        String body = readRequestBody(exchange);
        JsonObject json = gson.fromJson(body, JsonObject.class);

        if (json == null || !json.has("batchId") || !json.has("productName")
                || !json.has("quantity") || !json.has("expiryDate") || !json.has("zoneName")) {
            sendError(exchange, 400, "Missing required batch fields: batchId, productName, quantity, expiryDate, zoneName");
            return;
        }

        String batchId = json.get("batchId").getAsString().trim();
        String productName = json.get("productName").getAsString().trim();
        int quantity = json.get("quantity").getAsInt();
        String expiryStr = json.get("expiryDate").getAsString().trim();
        String zoneName = json.get("zoneName").getAsString().trim();

        if (batchId.isEmpty() || productName.isEmpty() || quantity <= 0) {
            sendError(exchange, 400, "Invalid batch details: batchId and productName must be non-empty, quantity > 0");
            return;
        }

        if (!"Freezer".equalsIgnoreCase(zoneName) &&
            !"Chiller".equalsIgnoreCase(zoneName) &&
            !"Ambient".equalsIgnoreCase(zoneName)) {
            sendError(exchange, 400, "Invalid storage zone. Must be Freezer, Chiller, or Ambient.");
            return;
        }

        LocalDate expiryDate;
        try {
            expiryDate = LocalDate.parse(expiryStr);
        } catch (Exception e) {
            sendError(exchange, 400, "Invalid expiry date format. Expected YYYY-MM-DD");
            return;
        }

        Batch batch = new Batch(batchId, productName, quantity, expiryDate, zoneName);
        if (!inventory.tryAddBatch(batch)) {
            sendError(exchange, 500, "Failed to save batch. Check that the batch ID is unique, the storage zone exists, and the database is available.");
            return;
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("success", true);
        resp.put("message", "Batch " + batchId + " added successfully.");
        resp.put("batch", batch);
        sendJsonResponse(exchange, 201, resp);
    }

    private void handleDispatchBatch(HttpExchange exchange) throws IOException {
        Batch dispatched = inventory.dispatchNextBatch();
        Map<String, Object> resp = new LinkedHashMap<>();
        if (dispatched != null) {
            resp.put("success", true);
            resp.put("batchId", dispatched.getBatchId());
            resp.put("message", "Dispatched batch: " + dispatched.getBatchId());
            resp.put("dispatchedBatch", dispatched);
            resp.put("remainingBatches", inventory.getBatchCount());
            sendJsonResponse(exchange, 200, resp);
        } else {
            resp.put("success", false);
            resp.put("message", "No eligible unexpired batch available for dispatch.");
            sendJsonResponse(exchange, 200, resp);
        }
    }

    private void handleUpdateQuantity(HttpExchange exchange) throws IOException {
        String body = readRequestBody(exchange);
        JsonObject json = gson.fromJson(body, JsonObject.class);

        if (json == null || !json.has("batchId") || !json.has("quantity")) {
            sendError(exchange, 400, "Missing batchId or quantity.");
            return;
        }

        String batchId = json.get("batchId").getAsString().trim();
        int quantity = json.get("quantity").getAsInt();

        boolean updated = inventory.updateBatchQuantity(batchId, quantity);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("success", updated);
        resp.put("batchId", batchId);
        resp.put("quantity", quantity);
        sendJsonResponse(exchange, updated ? 200 : 400, resp);
    }

    private void handleDeleteBatch(HttpExchange exchange) throws IOException {
        String body = readRequestBody(exchange);
        JsonObject json = gson.fromJson(body, JsonObject.class);

        if (json == null || !json.has("batchId")) {
            sendError(exchange, 400, "Missing batchId.");
            return;
        }

        String batchId = json.get("batchId").getAsString().trim();
        if (inventory.searchBatch(batchId) == null) {
            sendError(exchange, 404, "Batch not found: " + batchId);
            return;
        }

        if (inventory.deleteBatch(batchId) == null) {
            sendError(exchange, 500, "Failed to delete batch from the database: " + batchId);
            return;
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("success", true);
        resp.put("batchId", batchId);
        sendJsonResponse(exchange, 200, resp);
    }

    private void handleSensorSummary(HttpExchange exchange) throws IOException, SQLException {
        List<SensorDatasetRepository.SensorSummary> summaries = sensorRepo.getSensorSummaryList();
        sendJsonResponse(exchange, 200, summaries);
    }

    private void handleSensorDownsampled(HttpExchange exchange) throws IOException, SQLException {
        Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
        String sensorId = params.getOrDefault("sensorId", "SENSOR01");
        int maxPoints = 500;
        try {
            if (params.containsKey("maxPoints")) {
                maxPoints = Integer.parseInt(params.get("maxPoints"));
            }
        } catch (NumberFormatException ignored) {}

        List<SensorDatasetReading> readings = sensorRepo.getDownsampledReadings(sensorId, maxPoints);
        sendJsonResponse(exchange, 200, readings);
    }

    private void handleSensorPaginated(HttpExchange exchange) throws IOException, SQLException {
        Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
        String sensorId = params.getOrDefault("sensorId", "SENSOR01");
        int page = 1;
        int pageSize = 100;
        try {
            if (params.containsKey("page")) page = Integer.parseInt(params.get("page"));
            if (params.containsKey("pageSize")) pageSize = Integer.parseInt(params.get("pageSize"));
        } catch (NumberFormatException ignored) {}

        List<SensorDatasetReading> readings = sensorRepo.getPaginatedReadings(sensorId, page, pageSize);
        sendJsonResponse(exchange, 200, readings);
    }

    private void handleSensorAnomalies(HttpExchange exchange) throws IOException, SQLException {
        Map<String, String> params = parseQueryParams(exchange.getRequestURI().getQuery());
        String sensorId = params.getOrDefault("sensorId", "SENSOR01");
        double minTemp = -30.0;
        double maxTemp = 40.0;
        double maxHum = 95.0;
        double zScore = 2.5;

        try {
            if (params.containsKey("minTemp")) minTemp = Double.parseDouble(params.get("minTemp"));
            if (params.containsKey("maxTemp")) maxTemp = Double.parseDouble(params.get("maxTemp"));
            if (params.containsKey("maxHum")) maxHum = Double.parseDouble(params.get("maxHum"));
            if (params.containsKey("zScore")) zScore = Double.parseDouble(params.get("zScore"));
        } catch (NumberFormatException ignored) {}

        // Query downsampled slice and detect anomalies
        List<SensorDatasetReading> sampleReadings = sensorRepo.getDownsampledReadings(sensorId, 1000);
        SensorAnomalyDetector detector = new SensorAnomalyDetector(minTemp, maxTemp, maxHum, zScore);
        List<SensorAnomalyDetector.Anomaly> anomalies = detector.detect(sampleReadings);

        sendJsonResponse(exchange, 200, anomalies);
    }

    private void handleHeartbeat(HttpExchange exchange) throws IOException {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("alive", true);
        resp.put("timestamp", System.currentTimeMillis());
        sendJsonResponse(exchange, 200, resp);
    }

    private void handleShutdown(HttpExchange exchange) throws IOException {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("shuttingDown", true);
        sendJsonResponse(exchange, 200, resp);

        if (shutdownCallback != null) {
            new Thread(() -> {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException ignored) {}
                shutdownCallback.run();
                System.exit(0);
            }, "ColdFlow-Shutdown-Thread").start();
        }
    }

    private String readRequestBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody();
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[1024];
            int n;
            while ((n = is.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8);
        }
    }

    private void sendJsonResponse(HttpExchange exchange, int statusCode, Object data) throws IOException {
        String json = gson.toJson(data);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("error", true);
        error.put("statusCode", statusCode);
        error.put("message", message);
        sendJsonResponse(exchange, statusCode, error);
    }

    private Map<String, String> parseQueryParams(String query) {
        Map<String, String> map = new LinkedHashMap<>();
        if (query == null || query.isBlank()) {
            return map;
        }
        for (String param : query.split("&")) {
            String[] pair = param.split("=", 2);
            if (pair.length == 2) {
                map.put(pair[0].trim(), pair[1].trim());
            } else if (pair.length == 1) {
                map.put(pair[0].trim(), "");
            }
        }
        return map;
    }
}
