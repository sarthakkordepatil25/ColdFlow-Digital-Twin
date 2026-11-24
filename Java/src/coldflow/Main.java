package coldflow;

public class Main {


public static void main(String[] args) {

    // =========================================
    // COLDFlow - Initialize Warehouse
    // =========================================

    System.out.println("==========================================");
    System.out.println("        COLDFlow Warehouse System");
    System.out.println("==========================================");

    // =========================================
    // CREATE WAREHOUSE ZONES
    // =========================================

    FreezerZone freezer = new FreezerZone();
    ChillerZone chiller = new ChillerZone();
    AmbientZone ambient = new AmbientZone();

    // =========================================
    // RUNTIME POLYMORPHISM
    // =========================================

    StorageZone zone;

    zone = freezer;
    System.out.println("\nRuntime Polymorphism: " + zone.getZoneName());

    zone = chiller;
    System.out.println("Runtime Polymorphism: " + zone.getZoneName());

    zone = ambient;
    System.out.println("Runtime Polymorphism: " + zone.getZoneName());

    // =========================================
    // HYBRID INHERITANCE DEMONSTRATION
    // =========================================

    TemperatureControl temperatureControl = freezer;
    InventoryAware inventoryAware = freezer;

    System.out.println("\n===== HYBRID INHERITANCE DEMO =====");

    System.out.println(
            "Temperature Control Interface: "
                    + temperatureControl.isTemperatureSafe()
    );

    inventoryAware.displayInventoryStatus();

    // =========================================
    // LOAD INVENTORY FROM SUPABASE
    // =========================================

    System.out.println("\n===== LOADING INVENTORY FROM SUPABASE =====");

    InventoryManager inventory = new InventoryManager();

    // =========================================
    // DISPLAY INITIAL INVENTORY
    // =========================================

    System.out.println("\n===== INITIAL INVENTORY =====");

    inventory.displayInventory();

    System.out.println(
            "\nTotal batches loaded: " + inventory.getBatchCount()
    );

    // =========================================
    // START UNIFIED SERVER & DIGITAL TWIN
    // =========================================

    int port = coldflow.server.ColdFlowServer.DEFAULT_PORT;
    boolean launchSwing = false;

    for (String arg : args) {
        if ("--swing".equalsIgnoreCase(arg)) {
            launchSwing = true;
        } else if (arg.startsWith("--port=")) {
            try {
                port = Integer.parseInt(arg.substring(7));
            } catch (NumberFormatException ignored) {}
        }
    }

    try {
        coldflow.server.ColdFlowServer server =
                new coldflow.server.ColdFlowServer(port, freezer, chiller, ambient, inventory);
        server.start();
    } catch (Exception ex) {
        System.err.println("Failed to start ColdFlow Server: " + ex.getMessage());
        ex.printStackTrace();
    }

    // =========================================
    // OPTIONAL: START LEGACY SWING DASHBOARD
    // =========================================

    if (launchSwing) {
        javax.swing.SwingUtilities.invokeLater(() -> {

            Dashboard dashboard = new Dashboard(
                    freezer,
                    chiller,
                    ambient,
                    inventory
            );

            dashboard.setVisible(true);
        });
        System.out.println("COLDFlow Swing dashboard started.");
    }
}


}
