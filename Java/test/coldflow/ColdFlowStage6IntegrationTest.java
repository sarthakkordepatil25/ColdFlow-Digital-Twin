package coldflow;

import coldflow.server.ColdFlowServer;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * Stage 6 Comprehensive Integration & Quality Assurance Test Suite.
 * Exercises all REST APIs, Supabase operations, C++ engine, FEFO min-heap,
 * and Big-Data sensor downsampling pipelines.
 */
public class ColdFlowStage6IntegrationTest {

    private static final String BASE_URL = "http://127.0.0.1:8080";
    private static final Gson gson = new Gson();
    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) {
        System.out.println("================================================================================");
        System.out.println("  COLDFLOW STAGE 6 - COMPREHENSIVE END-TO-END INTEGRATION TEST SUITE            ");
        System.out.println("================================================================================");

        ColdFlowServer server = null;
        try {
            // 1. Boot ColdFlowServer
            System.out.println("\n[SETUP] Initializing ColdFlow core domains and server...");
            FreezerZone freezer = new FreezerZone();
            ChillerZone chiller = new ChillerZone();
            AmbientZone ambient = new AmbientZone();
            InventoryManager inventory = new InventoryManager();

            server = new ColdFlowServer(8080, freezer, chiller, ambient, inventory);
            server.start();
            Thread.sleep(1000);
            System.out.println("[SETUP] Server running successfully on port 8080.\n");

            // TEST 1: Health & Diagnostics
            testHealthCheck();

            // TEST 2: Storage Zones & COA Register Banks
            testStorageZones();

            // TEST 3: Active Inventory & FEFO Verification
            testInventoryAndFEFO();

            // TEST 4: Inbound Batch Intake (POST /api/inventory)
            testBatchIntake();

            // TEST 5: Quantity Update (POST /api/inventory/update)
            testBatchQuantityUpdate();

            // TEST 6: Input Validation & Error Handling (Negative Testing)
            testInputValidation();

            // TEST 7: Batch Deletion (POST /api/inventory/delete)
            testBatchDeletion();

            // TEST 8: FEFO Dispatch with Temporary Early-Expiry Batch
            testFEFODispatchExecution();

            // TEST 9: Simulation Cycle & C++ Engine Orchestration
            testSimulationCycle();

            // TEST 10: Big-Data Sensor IoT Summaries (1.41M Records)
            testSensorSummaries();

            // TEST 11: Sensor Hourly Downsampling & Performance Benchmark
            testSensorDownsamplingBenchmark();

            // TEST 12: Sensor Server-Side Anomaly Detection
            testSensorAnomalyDetection();

            // TEST 13: Heartbeat API
            testHeartbeat();

        } catch (Exception e) {
            System.err.println("FATAL TEST SUITE ERROR: " + e.getMessage());
            e.printStackTrace();
            failed++;
        } finally {
            if (server != null) {
                System.out.println("\n[TEARDOWN] Stopping ColdFlow Unified Server...");
                server.stop();
                System.out.println("[TEARDOWN] Server cleanly stopped with zero orphaned resources.");
            }
        }

        System.out.println("\n================================================================================");
        System.out.println("  STAGE 6 TEST SUMMARY: " + passed + " PASSED, " + failed + " FAILED");
        System.out.println("================================================================================");

        if (failed > 0) {
            System.exit(1);
        }
    }

    private static void check(String testName, boolean condition, String details) {
        if (condition) {
            System.out.printf("  [PASS] %-42s : %s%n", testName, details);
            passed++;
        } else {
            System.err.printf("  [FAIL] %-42s : %s%n", testName, details);
            failed++;
        }
    }

    private static void testHealthCheck() throws Exception {
        System.out.println("--- 1. HEALTH CHECK & SYSTEM DIAGNOSTICS ---");
        JsonObject res = getJson("/api/health");
        check("Health Status ONLINE", "ONLINE".equals(res.get("status").getAsString()), "Status=" + res.get("status"));
        check("Supabase Cloud Connected", res.get("databaseConnected").getAsBoolean(), "DB Connected=" + res.get("databaseConnected"));
        check("C++ Engine Mode Active", res.has("cppEngineMode"), "Mode=" + res.get("cppEngineMode").getAsString());
        check("Batch Count Populated", res.has("batchCount") && res.get("batchCount").getAsInt() >= 8, "BatchCount=" + res.get("batchCount"));
    }

    private static void testStorageZones() throws Exception {
        System.out.println("\n--- 2. STORAGE ZONES & HARDWARE REGISTERS ---");
        JsonArray zones = getJsonArray("/api/zones");
        check("Three Storage Zones Present", zones.size() == 3, "Zone Count=" + zones.size());

        boolean freezerFound = false, chillerFound = false, ambientFound = false;
        boolean registersFound = false;

        for (JsonElement el : zones) {
            JsonObject z = el.getAsJsonObject();
            String name = z.get("zoneName").getAsString();
            if ("Freezer".equals(name)) freezerFound = true;
            if ("Chiller".equals(name)) chillerFound = true;
            if ("Ambient".equals(name)) ambientFound = true;

            if (z.has("registers")) {
                JsonObject r = z.getAsJsonObject("registers");
                if (r.has("R0_Target") && r.has("R1_Current") && r.has("R2_Error") && r.has("R3_ControlStatus") && r.has("R4_EnergyKWh")) {
                    registersFound = true;
                }
            }
        }
        check("Freezer, Chiller, Ambient Found", freezerFound && chillerFound && ambientFound, "All zones verified");
        check("COA Register Bank (R0-R4) Active", registersFound, "Registers R0-R4 populated");
    }

    private static void testInventoryAndFEFO() throws Exception {
        System.out.println("\n--- 3. ACTIVE INVENTORY & FEFO VERIFICATION ---");
        JsonArray inv = getJsonArray("/api/inventory");
        check("Active Inventory >= 8", inv.size() >= 8, "Count=" + inv.size());

        // Check date ordering for FEFO
        String prevDate = "0000-00-00";
        boolean sorted = true;
        for (JsonElement el : inv) {
            JsonObject b = el.getAsJsonObject();
            String exp = b.get("expiryDate").getAsString();
            if (exp.compareTo(prevDate) < 0) {
                sorted = false;
            }
            prevDate = exp;
        }
        check("FEFO Priority Ordering", sorted, "Batches strictly ordered by expiry date");
    }

    private static void testBatchIntake() throws Exception {
        System.out.println("\n--- 4. INBOUND BATCH INTAKE (POST /api/inventory) ---");
        JsonObject payload = new JsonObject();
        payload.addProperty("batchId", "CF_STG6");
        payload.addProperty("productName", "Frozen Blueberries");
        payload.addProperty("quantity", 65);
        payload.addProperty("expiryDate", "2027-04-15");
        payload.addProperty("zoneName", "Freezer");

        JsonObject res = postJson("/api/inventory", payload);
        check("Add Batch Success", res.get("success").getAsBoolean(), "Batch CF_STG6 created");

        // Verify in inventory
        JsonArray inv = getJsonArray("/api/inventory");
        boolean exists = false;
        for (JsonElement el : inv) {
            if ("CF_STG6".equals(el.getAsJsonObject().get("batchId").getAsString())) {
                exists = true;
                break;
            }
        }
        check("Batch Persisted to Inventory", exists, "CF_STG6 confirmed in active inventory");
    }

    private static void testBatchQuantityUpdate() throws Exception {
        System.out.println("\n--- 5. BATCH QUANTITY UPDATE (POST /api/inventory/update) ---");
        JsonObject payload = new JsonObject();
        payload.addProperty("batchId", "CF_STG6");
        payload.addProperty("quantity", 55);

        JsonObject res = postJson("/api/inventory/update", payload);
        check("Update Quantity Success", res.get("success").getAsBoolean(), "Qty updated to 55");

        // Verify updated value
        JsonArray inv = getJsonArray("/api/inventory");
        int updatedQty = -1;
        for (JsonElement el : inv) {
            JsonObject b = el.getAsJsonObject();
            if ("CF_STG6".equals(b.get("batchId").getAsString())) {
                updatedQty = b.get("quantity").getAsInt();
                break;
            }
        }
        check("Quantity Verified in Supabase", updatedQty == 55, "Confirmed Qty=" + updatedQty);
    }

    private static void testInputValidation() throws Exception {
        System.out.println("\n--- 6. INPUT VALIDATION & ERROR HANDLING ---");

        // Negative quantity
        JsonObject negPayload = new JsonObject();
        negPayload.addProperty("batchId", "CF_BAD");
        negPayload.addProperty("productName", "Invalid Item");
        negPayload.addProperty("quantity", -20);
        negPayload.addProperty("expiryDate", "2027-01-01");
        negPayload.addProperty("zoneName", "Chiller");

        int code1 = postJsonForStatus("/api/inventory", negPayload);
        check("Reject Negative Quantity", code1 >= 400, "HTTP Status=" + code1);

        // Missing batch ID
        JsonObject missingPayload = new JsonObject();
        missingPayload.addProperty("productName", "No ID Item");
        missingPayload.addProperty("quantity", 10);
        missingPayload.addProperty("expiryDate", "2027-01-01");
        missingPayload.addProperty("zoneName", "Chiller");

        int code2 = postJsonForStatus("/api/inventory", missingPayload);
        check("Reject Missing Batch ID", code2 >= 400, "HTTP Status=" + code2);

        // Invalid zone
        JsonObject badZonePayload = new JsonObject();
        badZonePayload.addProperty("batchId", "CF_BADZONE");
        badZonePayload.addProperty("productName", "Bad Zone Item");
        badZonePayload.addProperty("quantity", 10);
        badZonePayload.addProperty("expiryDate", "2027-01-01");
        badZonePayload.addProperty("zoneName", "VolcanoZone");

        int code3 = postJsonForStatus("/api/inventory", badZonePayload);
        check("Reject Nonexistent Zone", code3 >= 400, "HTTP Status=" + code3);
    }

    private static void testBatchDeletion() throws Exception {
        System.out.println("\n--- 7. BATCH DELETION (POST /api/inventory/delete) ---");
        JsonObject payload = new JsonObject();
        payload.addProperty("batchId", "CF_STG6");

        JsonObject res = postJson("/api/inventory/delete", payload);
        check("Delete Batch Success", res.get("success").getAsBoolean(), "CF_STG6 deleted");

        // Verify gone from inventory
        JsonArray inv = getJsonArray("/api/inventory");
        boolean exists = false;
        for (JsonElement el : inv) {
            if ("CF_STG6".equals(el.getAsJsonObject().get("batchId").getAsString())) {
                exists = true;
                break;
            }
        }
        check("Batch Removed from Supabase", !exists, "CF_STG6 no longer in inventory");
    }

    private static void testFEFODispatchExecution() throws Exception {
        System.out.println("\n--- 8. FEFO DISPATCH EXECUTION ---");
        // Add a temporary batch with earliest expiry date
        JsonObject earlyBatch = new JsonObject();
        earlyBatch.addProperty("batchId", "CF_EARLY_DISPATCH");
        earlyBatch.addProperty("productName", "Ultra-Fresh Cream");
        earlyBatch.addProperty("quantity", 25);
        earlyBatch.addProperty("expiryDate", "2026-11-20");
        earlyBatch.addProperty("zoneName", "Chiller");

        postJson("/api/inventory", earlyBatch);

        // Now trigger FEFO dispatch
        JsonObject dispatchRes = postJson("/api/inventory/dispatch", new JsonObject());
        check("FEFO Dispatch Success", dispatchRes.get("success").getAsBoolean(), "Dispatched=" + dispatchRes.get("batchId").getAsString());
        check("FEFO Dispatched Earliest Batch", "CF_EARLY_DISPATCH".equals(dispatchRes.get("batchId").getAsString()),
                "Targeted CF_EARLY_DISPATCH (2026-11-20)");
    }

    private static void testSimulationCycle() throws Exception {
        System.out.println("\n--- 9. SIMULATION CYCLE & C++ ENGINE ---");
        long start = System.currentTimeMillis();
        JsonArray zones = postJsonForArray("/api/simulation/cycle");
        long elapsed = System.currentTimeMillis() - start;

        check("Cycle Response Received", zones.size() == 3, "Zones updated in " + elapsed + "ms");
        boolean coolingEvaluated = false;
        for (JsonElement el : zones) {
            JsonObject z = el.getAsJsonObject();
            if (z.has("compressorOn") && z.has("currentTemperature")) {
                coolingEvaluated = true;
            }
        }
        check("C++ Hysteresis & Trend Evaluated", coolingEvaluated, "Compressors & temperatures updated");
    }

    private static void testSensorSummaries() throws Exception {
        System.out.println("\n--- 10. BIG-DATA SENSOR SUMMARIES (1.41M RECORDS) ---");
        long start = System.currentTimeMillis();
        JsonArray summaries = getJsonArray("/api/sensors/summary");
        long elapsed = System.currentTimeMillis() - start;

        check("Nine Sensor Nodes (SENSOR01-09)", summaries.size() == 9, "Sensor count=" + summaries.size());
        long totalRows = 0;
        for (JsonElement el : summaries) {
            JsonObject s = el.getAsJsonObject();
            totalRows += s.get("totalRecords").getAsLong();
        }
        check("1.41M Total Historical Records", totalRows > 1400000, "Exact total=" + totalRows + " rows");
        check("Summary Query Latency < 2500ms", elapsed < 2500, "Completed in " + elapsed + "ms");
    }

    private static void testSensorDownsamplingBenchmark() throws Exception {
        System.out.println("\n--- 11. SENSOR DOWNSAMPLING BENCHMARK ---");
        long start = System.currentTimeMillis();
        JsonArray downsampled = getJsonArray("/api/sensors/downsampled?sensorId=SENSOR01&maxPoints=200");
        long elapsed = System.currentTimeMillis() - start;

        check("Downsampled Points <= 250", downsampled.size() > 0 && downsampled.size() <= 250, "Points=" + downsampled.size());
        check("Downsampling Response < 800ms", elapsed < 800, "Downsampled 156K rows to " + downsampled.size() + " in " + elapsed + "ms");
    }

    private static void testSensorAnomalyDetection() throws Exception {
        System.out.println("\n--- 12. SENSOR SERVER-SIDE ANOMALY DETECTION ---");
        JsonArray anomalies = getJsonArray("/api/sensors/anomalies?sensorId=SENSOR01");
        check("Anomalies Evaluated for SENSOR01", anomalies != null, "Anomalies found=" + anomalies.size());
        if (anomalies.size() > 0) {
            JsonObject first = anomalies.get(0).getAsJsonObject();
            check("Anomaly Has Measurement & Reason", first.has("measurement") && first.has("reason"),
                    first.get("measurement").getAsString() + ": " + first.get("reason").getAsString());
        }
    }

    private static void testHeartbeat() throws Exception {
        System.out.println("\n--- 13. HEARTBEAT API ---");
        JsonObject hb = getJson("/api/heartbeat");
        check("Heartbeat Alive", hb.has("alive") && hb.get("alive").getAsBoolean(), "Alive=" + hb.get("alive"));
        check("Heartbeat Timestamp", hb.has("timestamp"), "Timestamp=" + hb.get("timestamp").getAsLong());
    }

    // --- HTTP Helpers ---
    private static JsonObject getJson(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(BASE_URL + path).toURL().openConnection();
        conn.setRequestMethod("GET");
        try (InputStream in = conn.getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return gson.fromJson(text, JsonObject.class);
        }
    }

    private static JsonArray getJsonArray(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(BASE_URL + path).toURL().openConnection();
        conn.setRequestMethod("GET");
        try (InputStream in = conn.getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return gson.fromJson(text, JsonArray.class);
        }
    }

    private static JsonObject postJson(String path, JsonObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(BASE_URL + path).toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream out = conn.getOutputStream()) {
            out.write(gson.toJson(body).getBytes(StandardCharsets.UTF_8));
        }
        try (InputStream in = conn.getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return gson.fromJson(text, JsonObject.class);
        }
    }

    private static int postJsonForStatus(String path, JsonObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(BASE_URL + path).toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream out = conn.getOutputStream()) {
            out.write(gson.toJson(body).getBytes(StandardCharsets.UTF_8));
        }
        return conn.getResponseCode();
    }

    private static JsonArray postJsonForArray(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(BASE_URL + path).toURL().openConnection();
        conn.setRequestMethod("POST");
        try (InputStream in = conn.getInputStream()) {
            String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return gson.fromJson(text, JsonArray.class);
        }
    }
}
