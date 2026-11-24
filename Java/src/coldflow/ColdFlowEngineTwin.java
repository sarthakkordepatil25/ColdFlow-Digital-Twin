package coldflow;

import java.util.Locale;

/**
 * High-fidelity 1-to-1 Algorithmic Twin of {@code cpp/ColdFlowEngine.cpp}.
 *
 * Replicates the exact data structures, numerical precision, and control logic:
 * 1. Fixed-size circular array buffer (MAX_SENSORS = 10)
 * 2. Circular index pointer with wraparound
 * 3. O(n) running average calculation
 * 4. Trend detection with +/-0.5 deg C threshold
 * 5. Hysteresis cooling logic (ON_THRESHOLD = 2.0, OFF_THRESHOLD = 0.5)
 * 6. Falling-trend damping (trend < 0 && error > 0 -> IDLE)
 * 7. Two-line formatted output matching C++ output.txt (Error %.2f, Status)
 */
public class ColdFlowEngineTwin {

    public static final int MAX_SENSORS = 10;
    public static final double ON_THRESHOLD = 2.0;
    public static final double OFF_THRESHOLD = 0.5;

    public static class SensorReading {
        public double temperature;
        public double humidity;
        public int status;

        public SensorReading(double temperature, double humidity, int status) {
            this.temperature = temperature;
            this.humidity = humidity;
            this.status = status;
        }
    }

    public static class EngineResult {
        public final double temperatureError;
        public final String coolingStatus;
        public final double averageTemperature;
        public final int trend;
        public final int sensorCount;
        public final String formattedError;

        public EngineResult(double temperatureError, String coolingStatus,
                            double averageTemperature, int trend, int sensorCount) {
            this.temperatureError = temperatureError;
            this.coolingStatus = coolingStatus;
            this.averageTemperature = averageTemperature;
            this.trend = trend;
            this.sensorCount = sensorCount;
            this.formattedError = String.format(Locale.ROOT, "%.2f", temperatureError);
        }

        public String[] toOutputLines() {
            return new String[]{formattedError, coolingStatus};
        }

        @Override
        public String toString() {
            return String.format(Locale.ROOT, "EngineResult[Error=%s, Cooling=%s, Avg=%.2f, Trend=%d, Samples=%d]",
                    formattedError, coolingStatus, averageTemperature, trend, sensorCount);
        }
    }

    // Circular array state
    private final SensorReading[] sensorArray = new SensorReading[MAX_SENSORS];
    private int sensorIndex = 0;
    private int sensorCount = 0;

    public ColdFlowEngineTwin() {
        for (int i = 0; i < MAX_SENSORS; i++) {
            sensorArray[i] = new SensorReading(0.0, 0.0, 0);
        }
    }

    /**
     * Adds one sensor reading matching void addSensorReading() in C++.
     */
    public synchronized void addSensorReading(double temperature, double humidity, int status) {
        sensorArray[sensorIndex].temperature = temperature;
        sensorArray[sensorIndex].humidity = humidity;
        sensorArray[sensorIndex].status = status;

        sensorIndex = (sensorIndex + 1) % MAX_SENSORS;

        if (sensorCount < MAX_SENSORS) {
            sensorCount++;
        }
    }

    /**
     * Traverses the circular buffer to calculate average temperature matching getAverageTemperature() in C++.
     */
    public synchronized double getAverageTemperature() {
        if (sensorCount == 0) {
            return 0.0;
        }

        double sum = 0.0;
        for (int i = 0; i < sensorCount; i++) {
            sum += sensorArray[i].temperature;
        }

        return sum / sensorCount;
    }

    /**
     * Detects temperature trend matching int detectTrend() in C++.
     * Returns:
     *   1  -> Rising (> 0.5)
     *  -1  -> Falling (< -0.5)
     *   0  -> Stable
     */
    public synchronized int detectTrend() {
        if (sensorCount < 2) {
            return 0;
        }

        int oldestIndex = (sensorIndex - sensorCount + MAX_SENSORS) % MAX_SENSORS;
        int newestIndex = (sensorIndex - 1 + MAX_SENSORS) % MAX_SENSORS;

        double oldest = sensorArray[oldestIndex].temperature;
        double newest = sensorArray[newestIndex].temperature;

        double difference = newest - oldest;

        if (difference > 0.5) {
            return 1;
        }
        if (difference < -0.5) {
            return -1;
        }

        return 0;
    }

    /**
     * Calculates temperature error matching ColdFlowEngine::calculateError() in C++.
     */
    public static double calculateError(double currentTemperature, double targetTemperature) {
        return currentTemperature - targetTemperature;
    }

    /**
     * Executes the complete processing cycle matching main() in ColdFlowEngine.cpp.
     */
    public synchronized EngineResult processCycle(double currentTemperature, double targetTemperature, double humidity) {
        // Step 1: Add reading to circular array
        addSensorReading(currentTemperature, humidity, 0);

        // Step 2: Calculate running average
        double averageTemperature = getAverageTemperature();

        // Step 3: Detect trend
        int trend = detectTrend();

        // Step 4: Compute temperature error
        double temperatureError = calculateError(currentTemperature, targetTemperature);

        // Step 5: Determine cooling status with hysteresis
        String coolingStatus;
        if (temperatureError > ON_THRESHOLD) {
            coolingStatus = "ON";
        } else if (temperatureError <= OFF_THRESHOLD) {
            coolingStatus = "OFF";
        } else {
            coolingStatus = "IDLE";
        }

        // Step 6: Falling trend damping
        if (trend < 0 && temperatureError > 0) {
            coolingStatus = "IDLE";
        }

        return new EngineResult(temperatureError, coolingStatus, averageTemperature, trend, sensorCount);
    }

    /**
     * One-shot static execution matching exact single-run invocation of ColdFlowEngine.cpp from CppBridge.
     */
    public static EngineResult executeOneShot(double currentTemperature, double targetTemperature) {
        ColdFlowEngineTwin singleRun = new ColdFlowEngineTwin();
        return singleRun.processCycle(currentTemperature, targetTemperature, 65.0);
    }
}
