package coldflow;

/**
 * Automated Algorithmic Parity Test Suite.
 *
 * Verifies that ColdFlowEngineTwin produces outputs numerically and logically identical
 * to the documented C++ ColdFlowEngine.cpp specification.
 */
public class ColdFlowEngineParityTest {

    private static int testsPassed = 0;
    private static int testsFailed = 0;

    public static void main(String[] args) {
        System.out.println("==================================================");
        System.out.println("  COLDFLOW C++ ENGINE PARITY TEST HARNESS");
        System.out.println("==================================================");

        // Test 1: Basic Cold Room error & ON threshold (Error > 2.0)
        testScenario("Freezer High Heat", -16.0, -20.0, 4.00, "ON");

        // Test 2: Basic Cold Room error & OFF threshold (Error <= 0.5)
        testScenario("Freezer At Setpoint", -20.0, -20.0, 0.00, "OFF");
        testScenario("Freezer Sub-Setpoint", -21.5, -20.0, -1.50, "OFF");
        testScenario("Freezer Boundary 0.5", -19.5, -20.0, 0.50, "OFF");

        // Test 3: Deadband / Idle region (0.5 < Error <= 2.0)
        testScenario("Freezer Intermediate", -18.8, -20.0, 1.20, "IDLE");
        testScenario("Freezer Boundary 2.0", -18.0, -20.0, 2.00, "IDLE");

        // Test 4: Chiller zone scenarios (Target 4.0 C)
        testScenario("Chiller Spike", 7.5, 4.0, 3.50, "ON");
        testScenario("Chiller Normal", 4.2, 4.0, 0.20, "OFF");
        testScenario("Chiller Marginal", 5.2, 4.0, 1.20, "IDLE");

        // Test 5: Ambient zone scenarios (Target 25.0 C)
        testScenario("Ambient Hot Day", 29.0, 25.0, 4.00, "ON");
        testScenario("Ambient Standard", 25.3, 25.0, 0.30, "OFF");
        testScenario("Ambient Moderate", 26.5, 25.0, 1.50, "IDLE");

        // Test 6: Trend detection and damping sequence
        testTrendDamping();

        // Test 7: Circular buffer wraparound (15 readings into 10-slot buffer)
        testBufferWraparound();

        System.out.println("==================================================");
        System.out.printf("RESULTS: %d Passed, %d Failed%n", testsPassed, testsFailed);
        System.out.println("==================================================");

        if (testsFailed > 0) {
            System.exit(1);
        }
    }

    private static void testScenario(String name, double current, double target, double expectedError, String expectedStatus) {
        ColdFlowEngineTwin.EngineResult result = ColdFlowEngineTwin.executeOneShot(current, target);

        boolean errorMatches = Math.abs(result.temperatureError - expectedError) < 0.001;
        boolean statusMatches = result.coolingStatus.equals(expectedStatus);

        if (errorMatches && statusMatches) {
            testsPassed++;
            System.out.printf("[PASS] %-25s: Error=%s, Status=%s%n", name, result.formattedError, result.coolingStatus);
        } else {
            testsFailed++;
            System.out.printf("[FAIL] %-25s: Expected Error=%.2f Status=%s, Got Error=%.2f Status=%s%n",
                    name, expectedError, expectedStatus, result.temperatureError, result.coolingStatus);
        }
    }

    private static void testTrendDamping() {
        ColdFlowEngineTwin engine = new ColdFlowEngineTwin();

        // Feed rising temperatures: 20.0, 21.0, 22.0
        engine.processCycle(20.0, 18.0, 60.0);
        engine.processCycle(21.0, 18.0, 60.0);
        ColdFlowEngineTwin.EngineResult r1 = engine.processCycle(22.0, 18.0, 60.0);

        // Error = 22.0 - 18.0 = 4.0 (> 2.0), Trend = 1 (Rising) -> Status = ON
        assertEqual("Trend Rising Status", "ON", r1.coolingStatus);
        assertEqual("Trend Rising Value", 1, r1.trend);

        // Now temperature starts falling: 21.0, then 19.5
        engine.processCycle(21.0, 18.0, 60.0);
        engine.processCycle(19.5, 18.0, 60.0);

        // Error = 19.5 - 18.0 = 1.5 (> 0). Newest (19.5) - Oldest (20.0) = -0.5, let's drop to 19.0 to be < -0.5
        ColdFlowEngineTwin.EngineResult r3 = engine.processCycle(19.0, 18.0, 60.0);

        // Trend is falling (< -0.5) and Error > 0 -> Damping sets coolingStatus to IDLE!
        assertEqual("Falling Trend Damping", "IDLE", r3.coolingStatus);
        assertEqual("Trend Falling Value", -1, r3.trend);
    }

    private static void testBufferWraparound() {
        ColdFlowEngineTwin engine = new ColdFlowEngineTwin();

        // Feed 15 items to check wraparound (capacity 10)
        for (int i = 1; i <= 15; i++) {
            engine.processCycle(i * 1.0, 0.0, 60.0);
        }

        // Buffer should have exactly 10 samples (readings 6 through 15)
        ColdFlowEngineTwin.EngineResult result = engine.processCycle(16.0, 0.0, 60.0);
        assertEqual("Max Sensor Cap", 10, result.sensorCount);

        // Average of last 10 readings: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 -> sum = 115 / 10 = 11.5
        boolean avgMatches = Math.abs(result.averageTemperature - 11.5) < 0.001;
        if (avgMatches) {
            testsPassed++;
            System.out.printf("[PASS] %-25s: Avg=%.2f (Expected 11.5)%n", "Circular Wraparound Average", result.averageTemperature);
        } else {
            testsFailed++;
            System.out.printf("[FAIL] %-25s: Expected Avg=11.5, Got %.2f%n", "Circular Wraparound Average", result.averageTemperature);
        }
    }

    private static void assertEqual(String testName, Object expected, Object actual) {
        if (expected.equals(actual)) {
            testsPassed++;
            System.out.printf("[PASS] %-25s: %s%n", testName, actual);
        } else {
            testsFailed++;
            System.out.printf("[FAIL] %-25s: Expected %s, Got %s%n", testName, expected, actual);
        }
    }
}
