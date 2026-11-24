package coldflow.database;

import coldflow.SensorDatasetReading;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;

public class SensorDatasetRepository {

    private static final String INSERT_SQL =
            "INSERT INTO sensor_readings " +
            "(sensor_id, recorded_at, temperature, humidity) " +
            "VALUES (?, ?, ?, ?) " +
            "ON CONFLICT (sensor_id, recorded_at) DO NOTHING";

    private static final String SELECT_ALL =
            "SELECT sensor_id, recorded_at, temperature, humidity " +
            "FROM sensor_readings " +
            "ORDER BY sensor_id ASC, recorded_at ASC";

    /**
     * Inserts sensor readings in batches.
     * Used by SensorDatasetBulkImporter.
     */
    public int insertBatch(Connection connection,
                           List<SensorDatasetReading> readings)
            throws SQLException {

        if (connection == null) {
            throw new IllegalArgumentException(
                    "Database connection cannot be null.");
        }

        if (readings == null || readings.isEmpty()) {
            return 0;
        }

        int inserted = 0;

        try (PreparedStatement statement =
                     connection.prepareStatement(INSERT_SQL)) {

            for (SensorDatasetReading reading : readings) {

                if (reading == null
                        || reading.getSensorId() == null
                        || reading.getTimestamp() == null) {
                    throw new SQLException(
                            "Sensor reading is missing its sensor ID or timestamp.");
                }

                statement.setString(1, reading.getSensorId());

                statement.setTimestamp(
                        2, Timestamp.valueOf(reading.getTimestamp()));

                if (reading.getTemperature() == null) {
                    statement.setNull(3, Types.DOUBLE);
                } else {
                    statement.setDouble(3, reading.getTemperature());
                }

                if (reading.getHumidity() == null) {
                    statement.setNull(4, Types.DOUBLE);
                } else {
                    statement.setDouble(4, reading.getHumidity());
                }

                statement.addBatch();
            }

            int[] results = statement.executeBatch();

            for (int result : results) {
                if (result > 0) {
                    inserted += result;
                } else if (result == PreparedStatement.SUCCESS_NO_INFO) {
                    inserted++;
                }
            }
        }

        return inserted;
    }

    /**
     * Retrieves all historical sensor readings from Supabase.
     * Used by Sensor Monitoring.
     */
    public List<SensorDatasetReading> getAllReadings()
            throws SQLException {

        List<SensorDatasetReading> readings =
                new ArrayList<>(1_420_000);

        try (Connection connection = DatabaseManager.getConnection()) {

            if (connection == null || !connection.isValid(10)) {
                throw new SQLException(
                        "Could not establish a valid Supabase connection.");
            }

            boolean originalAutoCommit = connection.getAutoCommit();

            try {
                connection.setAutoCommit(false);

                try (PreparedStatement statement =
                             connection.prepareStatement(
                                     SELECT_ALL,
                                     ResultSet.TYPE_FORWARD_ONLY,
                                     ResultSet.CONCUR_READ_ONLY)) {

                    statement.setFetchSize(5000);
                    statement.setQueryTimeout(180);

                    try (ResultSet resultSet = statement.executeQuery()) {

                        while (resultSet.next()) {

                            String sensorId =
                                    resultSet.getString("sensor_id");

                            Timestamp recordedAt =
                                    resultSet.getTimestamp("recorded_at");

                            if (sensorId == null || recordedAt == null) {
                                continue;
                            }

                            double temperatureValue =
                                    resultSet.getDouble("temperature");

                            Double temperature =
                                    resultSet.wasNull()
                                            ? null : temperatureValue;

                            double humidityValue =
                                    resultSet.getDouble("humidity");

                            Double humidity =
                                    resultSet.wasNull()
                                            ? null : humidityValue;

                            readings.add(new SensorDatasetReading(
                                    sensorId,
                                    recordedAt.toLocalDateTime(),
                                    temperature,
                                    humidity));
                        }
                    }
                }

                connection.commit();

            } catch (SQLException | RuntimeException ex) {

                try {
                    connection.rollback();
                } catch (SQLException rollbackException) {
                    ex.addSuppressed(rollbackException);
                }

                throw ex;

            } finally {

                try {
                    connection.setAutoCommit(originalAutoCommit);
                } catch (SQLException ignored) {
                    // Connection is closing.
                }
            }
        }

        return readings;
    }

    public static class SensorSummary {
        public final String sensorId;
        public final String startTime;
        public final String endTime;
        public final long totalRecords;
        public final Double avgTemperature;
        public final Double avgHumidity;

        public SensorSummary(String sensorId, String startTime, String endTime,
                             long totalRecords, Double avgTemperature, Double avgHumidity) {
            this.sensorId = sensorId;
            this.startTime = startTime;
            this.endTime = endTime;
            this.totalRecords = totalRecords;
            this.avgTemperature = avgTemperature;
            this.avgHumidity = avgHumidity;
        }
    }

    /**
     * High-speed summary of all sensors without loading raw data.
     */
    public List<SensorSummary> getSensorSummaryList() throws SQLException {
        List<SensorSummary> list = new ArrayList<>();
        String sql = """
            SELECT sensor_id,
                   MIN(recorded_at) as start_time,
                   MAX(recorded_at) as end_time,
                   COUNT(*) as total_records,
                   ROUND(AVG(temperature)::numeric, 2) as avg_temp,
                   ROUND(AVG(humidity)::numeric, 2) as avg_hum
            FROM sensor_readings
            GROUP BY sensor_id
            ORDER BY sensor_id ASC
            """;

        try (Connection con = DatabaseManager.getConnection();
             PreparedStatement ps = con.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String sid = rs.getString("sensor_id");
                Timestamp st = rs.getTimestamp("start_time");
                Timestamp et = rs.getTimestamp("end_time");
                long count = rs.getLong("total_records");
                double atVal = rs.getDouble("avg_temp");
                Double avgT = rs.wasNull() ? null : atVal;
                double ahVal = rs.getDouble("avg_hum");
                Double avgH = rs.wasNull() ? null : ahVal;

                list.add(new SensorSummary(
                        sid,
                        st != null ? st.toString() : "",
                        et != null ? et.toString() : "",
                        count,
                        avgT,
                        avgH
                ));
            }
        }
        return list;
    }

    /**
     * Efficient server-side downsampled query for time-series charts.
     */
    public List<SensorDatasetReading> getDownsampledReadings(String sensorId, int maxPoints) throws SQLException {
        if (sensorId == null || sensorId.isBlank()) {
            throw new IllegalArgumentException("Sensor ID cannot be blank.");
        }
        if (maxPoints <= 0) {
            maxPoints = 500;
        }

        List<SensorDatasetReading> readings = new ArrayList<>(maxPoints);
        String sql = """
            SELECT date_trunc('hour', recorded_at) AS time_bucket,
                   ROUND(AVG(temperature)::numeric, 2) AS avg_temp,
                   ROUND(AVG(humidity)::numeric, 2) AS avg_hum
            FROM sensor_readings
            WHERE sensor_id = ?
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
            LIMIT ?
            """;

        try (Connection con = DatabaseManager.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setString(1, sensorId);
            ps.setInt(2, maxPoints);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Timestamp ts = rs.getTimestamp("time_bucket");
                    double tVal = rs.getDouble("avg_temp");
                    Double temp = rs.wasNull() ? null : tVal;
                    double hVal = rs.getDouble("avg_hum");
                    Double hum = rs.wasNull() ? null : hVal;
                    if (ts != null) {
                        readings.add(new SensorDatasetReading(sensorId, ts.toLocalDateTime(), temp, hum));
                    }
                }
            }
        }
        return readings;
    }

    /**
     * High-precision paginated raw readings query.
     */
    public List<SensorDatasetReading> getPaginatedReadings(String sensorId, int page, int pageSize) throws SQLException {
        if (sensorId == null || sensorId.isBlank()) {
            throw new IllegalArgumentException("Sensor ID cannot be blank.");
        }
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 500) pageSize = 100;

        int offset = (page - 1) * pageSize;
        List<SensorDatasetReading> readings = new ArrayList<>(pageSize);
        String sql = """
            SELECT recorded_at, temperature, humidity
            FROM sensor_readings
            WHERE sensor_id = ?
            ORDER BY recorded_at DESC
            LIMIT ? OFFSET ?
            """;

        try (Connection con = DatabaseManager.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setString(1, sensorId);
            ps.setInt(2, pageSize);
            ps.setInt(3, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Timestamp ts = rs.getTimestamp("recorded_at");
                    double tVal = rs.getDouble("temperature");
                    Double temp = rs.wasNull() ? null : tVal;
                    double hVal = rs.getDouble("humidity");
                    Double hum = rs.wasNull() ? null : hVal;
                    if (ts != null) {
                        readings.add(new SensorDatasetReading(sensorId, ts.toLocalDateTime(), temp, hum));
                    }
                }
            }
        }
        return readings;
    }
}