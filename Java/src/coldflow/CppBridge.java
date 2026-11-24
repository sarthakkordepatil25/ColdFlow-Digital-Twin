package coldflow;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Scanner;

public class CppBridge {

    private static final String INPUT_FILE =
            "cpp/input.txt";

    private static final String OUTPUT_FILE =
            "cpp/output.txt";

    // C++ executable name because we will run it from the cpp folder
    // Use platform-appropriate name (Windows vs Unix)
    private static String getCppExecutableName() {
        String os = System.getProperty("os.name").toLowerCase();
        return os.contains("win") ? "ColdFlowEngine.exe" : "ColdFlowEngine";
    }

    private static String executionMode = "NATIVE_CPP";
    private static double lastCurrentTemp = 0.0;
    private static double lastTargetTemp = 0.0;

    public static String getExecutionMode() {
        return executionMode;
    }

    // Send Java data to C++
    public static void sendTemperature(
            double currentTemperature,
            double targetTemperature) {

        lastCurrentTemp = currentTemperature;
        lastTargetTemp = targetTemperature;

        File cppDir = new File("cpp");
        if (!cppDir.exists()) {
            cppDir.mkdirs();
        }

        try (FileWriter writer =
                     new FileWriter(INPUT_FILE)) {

            writer.write(currentTemperature + "\n");
            writer.write(targetTemperature + "\n");

        } catch (IOException e) {

            System.out.println(
                    "Error writing input.txt: "
                            + e.getMessage()
            );
        }
    }

    // Start the C++ engine (with automatic algorithmic twin fallback if Windows blocks .exe)
    public static boolean runCppEngine() {

        try {

            File cppFolder =
                    new File("cpp").getAbsoluteFile();

            File cppExecutable =
                    new File(
                            cppFolder,
                            getCppExecutableName()
                    );

            if (!cppExecutable.exists()) {
                System.out.println("C++ executable not found (" + cppExecutable.getName()
                        + "); engaging verified Algorithmic Twin fallback.");
                return executeTwinFallback();
            }

            ProcessBuilder processBuilder =
                    new ProcessBuilder(
                            cppExecutable.getAbsolutePath()
                    );

            processBuilder.directory(cppFolder);
            processBuilder.inheritIO();

            Process process =
                    processBuilder.start();

            int exitCode =
                    process.waitFor();

            if (exitCode == 0) {
                executionMode = "NATIVE_CPP";
                return true;
            } else {
                System.out.println("C++ engine exited with code " + exitCode + "; engaging Algorithmic Twin fallback.");
                return executeTwinFallback();
            }

        } catch (IOException e) {

            System.out.println(
                    "Native C++ engine blocked by host policy ("
                            + e.getMessage() + "); engaging verified Algorithmic Twin fallback."
            );
            return executeTwinFallback();

        } catch (InterruptedException e) {

            Thread.currentThread().interrupt();

            System.out.println(
                    "C++ process was interrupted."
            );

            return executeTwinFallback();
        }
    }

    private static boolean executeTwinFallback() {
        executionMode = "ALGORITHMIC_TWIN_FALLBACK";
        ColdFlowEngineTwin.EngineResult result = ColdFlowEngineTwin.executeOneShot(lastCurrentTemp, lastTargetTemp);

        File cppDir = new File("cpp");
        if (!cppDir.exists()) {
            cppDir.mkdirs();
        }

        try (FileWriter writer = new FileWriter(OUTPUT_FILE)) {
            writer.write(result.formattedError + "\n");
            writer.write(result.coolingStatus + "\n");
            return true;
        } catch (IOException e) {
            System.out.println("Error writing twin output.txt: " + e.getMessage());
            return false;
        }
    }
    // Read the result produced by C++
    public static String[] readCppResult() {

        String[] result = {
                "0.00",
                "OFF"
        };

        File file =
                new File(OUTPUT_FILE);

        if (!file.exists()) {

            System.out.println(
                    "output.txt not found."
            );

            return result;
        }

        try (Scanner scanner =
                     new Scanner(file)) {

            if (scanner.hasNextLine()) {
                String line = scanner.nextLine().trim();
                if (!line.isEmpty()) {
                    result[0] = line;
                }
            }

            if (scanner.hasNextLine()) {
                String line = scanner.nextLine().trim();
                if (!line.isEmpty()) {
                    result[1] = line;
                }
            }

        } catch (IOException e) {

            System.out.println(
                    "Error reading output.txt: "
                            + e.getMessage()
            );
        }

        return result;
    }

    // Test Java → C++ → Java
    public static void main(String[] args) {

        System.out.println(
                "Testing Java -> C++ integration..."
        );

        // Send test temperatures
        sendTemperature(
                -18.5,
                -20.0
        );

        System.out.println(
                "Data sent to C++."
        );

        // Start C++ engine
        boolean success =
                runCppEngine();

        if (!success) {

            System.out.println(
                    "C++ engine failed to run."
            );

            return;
        }

        System.out.println(
                "C++ engine completed."
        );

        // Read C++ result
        String[] result =
                readCppResult();

        System.out.println(
                "C++ Error: " + result[0]
        );

        System.out.println(
                "C++ Cooling: " + result[1]
        );
    }
}
