# ColdFlow: Portfolio Demonstration & Presentation Guide
### Step-by-Step Walkthrough for Recruiters, Software Engineers & Faculty Evaluators

**Target Audience:** Technical Recruiters, Engineering Managers, Systems Architects, Academic Faculty  
**Demonstration Time:** 5–10 Minutes  
**Prerequisites:** Windows 10/11, Java 21 LTS installed, Internet connection (for Supabase PostgreSQL over SSL)  

---

## 🎯 1. The 30-Second Elevator Pitch

> *"Most warehouse systems are split between disconnected databases, legacy SCADA hardware, and 2D spreadsheet grids. ColdFlow unifies all of them into **one hardware-accelerated 3D Digital Twin**. It connects a Project Loom virtual-thread Java backend directly to a cloud PostgreSQL database, orchestrates a native C++ thermal-processing engine with sliding-window hysteresis, runs an $O(1)$ indexed FEFO min-heap for perishable goods, and visualizes an autonomous AGV forklift retrieving pallets in real time—while downsampling a 1.41-million-row environmental sensor dataset in under 250 milliseconds."*

---

## 🎬 2. The Demonstration Walkthrough

### Phase 1: Single-Click Launch & Native Desktop Window (1 Minute)
1. **Show the Project Root:** Open the `ColdFlow grp project` folder in Windows File Explorer.
2. **Double-Click `Run-ColdFlow.bat`:**
   - Point out the automated PowerShell supervisor console.
   - Highlight what is happening behind the scenes:
     1. Validates Supabase environment variables.
     2. Compiles Java source files with JDBC and Gson drivers into a secure temporary cache.
     3. Boots the Java virtual-thread server on `127.0.0.1:8080`.
     4. Awaits health check readiness (`/api/health`).
     5. Automatically spawns Microsoft Edge in **Native Application Mode** (`--app`), creating a standalone, borderless desktop window with no browser URL bar or navigation buttons.
3. **Key Talking Point:** *"This is not a generic website tab. It is an authentic, unified desktop application experience with zero manual module startup."*

---

### Phase 2: Visual Tour of the 3D Industrial Facility (1.5 Minutes)
1. **Explore the 3D Warehouse:**
   - Use the left mouse button to rotate, right button to pan, and wheel to zoom.
   - Click the camera preset buttons at the bottom of the screen:
     * **Warehouse Overview:** Complete facility view showing all three zones and dispatch dock.
     * **Freezer Zone ($-20^\circ\text{C}$):** Highlight the cold blue industrial lighting, insulated wall panels, and **volumetric sub-zero cold vapor particle emitters**.
     * **Chiller Zone ($4^\circ\text{C}$):** Fresh food storage area with emerald LED status indicators.
     * **Ambient Zone ($25^\circ\text{C}$):** Dry goods staging area.
     * **Dispatch Dock:** Loading bay with rolling shutter doors and the Autonomous Guided Vehicle (AGV).
2. **Inspect Pallet Details:**
   - Zoom in on any pallet on the teardrop racks.
   - Point out the realistic Euro-pallet wooden deckboards and the corrugated cartons featuring **procedural shipping labels with live batch numbers and barcodes**.
3. **Show Real-Time 3D Performance:**
   - Point to the performance HUD badge at the bottom-right corner:
     ```text
     60 FPS | 14,800 Triangles | 8 Pallets
     ```
   - Mention: *"The procedural geometry is optimized for steady 60 FPS WebGL rendering without relying on external 3D asset downloads."*

---

### Phase 3: Interactive Raycasting & Database Sync (1.5 Minutes)
1. **Click a 3D Pallet:**
   - Click on any physical pallet on the storage racks.
   - Observe the **Batch Inspector Drawer** slide smoothly into view from the right.
   - Highlight that every field (Batch ID, Product Name, Quantity, Expiry Date, Storage Zone, Days Remaining) reflects actual live records from Supabase PostgreSQL.
2. **Locate from Inventory Table:**
   - On the left sidebar under "FEFO Inventory Flow", click on any batch (e.g., `CF005 - Chicken`).
   - Notice the 3D camera smoothly animates and focuses directly on the corresponding pallet, highlighting it with an emerald bounding beacon.

---

### Phase 4: Algorithmic FEFO Dispatch & AGV Animation (2 Minutes)
1. **Explain the FEFO Priority:**
   - Explain: *"In perishable cold-chain logistics, First-Expired-First-Out (FEFO) is critical. Traditional $O(n)$ linear searches are replaced in ColdFlow by a custom **Min-Heap with an in-memory HashMap index**, delivering $O(1)$ priority extraction and $O(1)$ ID lookup."*
2. **Click "Dispatch Next FEFO":**
   - Click the amber **"⚡ Dispatch Next FEFO"** button on the top navigation bar.
   - Watch the system:
     1. The Java backend extracts the earliest-expiring batch from the FEFO min-heap.
     2. Deletes the batch from the cloud Supabase database.
     3. The 3D AGV forklift activates its flashing amber safety strobe, drives along the aisle to the exact rack slot, lowers its forks, retrieves the pallet, and navigates smoothly back to the dispatch dock.
     4. The HUD inventory counter updates automatically.
3. **Key Talking Point:** *"The AGV animation is not an ornamental pre-rendered loop. It is dynamically triggered only upon a successful database transaction."*

---

### Phase 5: Inbound Batch Intake & Editing (1.5 Minutes)
1. **Click "+ Inbound Batch":**
   - Click the blue **"+ Inbound Batch"** button on the top bar.
   - Enter test details:
     * Batch ID: `DEMO_101`
     * Product Name: `Organic Strawberries`
     * Quantity: `75`
     * Expiry Date: *(e.g. 2027-05-20)*
     * Zone: `Chiller`
   - Click **"Commit to Supabase & Store in 3D Rack"**.
2. **Observe Instant 3D Placement:**
   - Watch the new pallet with live shipping labels instantly spawn in the Chiller zone rack.
   - Click the pallet to open the Batch Inspector.
   - Click **"Edit Qty"**, change quantity to `60`, and observe the immediate update in Supabase and the 3D HUD.
   - Click **"Delete"** to clean up the test batch.

---

### Phase 6: C++ Thermal Dynamics & COA Hardware Registers (1.5 Minutes)
1. **Click "Trigger Cycle":**
   - Click the **"⟳ Trigger Cycle"** button on the top bar.
   - Show the top-bar status pill:
     ```text
     C++ Engine: NATIVE_CPP
     ```
2. **Explain the C++ Architecture:**
   - Explain: *"ColdFlow features a dual-track architecture. It executes `ColdFlowEngine.exe` natively via IPC pipes, maintaining a rolling 10-reading circular buffer. If Windows security policies (WDAC/AppLocker) restrict native binaries, it automatically falls back to an algorithmic Java twin (`ColdFlowEngineTwin.java`) verified against an 18/18 parity test suite."*
3. **Inspect the COA Register Bank:**
   - Click the Chiller or Freezer zone card on the left panel.
   - Point out the **COA Hardware Register Bank** drawer:
     * $R_0$ (Target Setpoint): $-20.0^\circ\text{C}$ or $4.0^\circ\text{C}$
     * $R_1$ (Current Temperature): Measured sensor telemetry
     * $R_2$ (Error Delta): $R_1 - R_0$
     * $R_3$ (Actuator Control): $0 = \text{OFF}, 1 = \text{ACTIVE}$
     * $R_4$ (Cumulative Energy): Kilowatt-hours (kWh) consumed by cooling equipment
   - Notice the overhead evaporator fans spinning rapidly when cooling is active!

---

### Phase 7: Big-Data IoT Analytics (1,411,515 Records) (1.5 Minutes)
1. **Open "📊 Sensor IoT Analytics":**
   - Click the **"📊 Sensor IoT Analytics"** button.
   - Show the header:
     ```text
     1,411,515 Historical Environmental Measurements across 9 IoT Sensors
     ```
2. **Demonstrate Big-Data Optimization:**
   - Explain the technical obstacle: *"Loading 1.41 million records into the browser would consume gigabytes of RAM and crash the WebGL context."*
   - Show the performance metric badge:
     ```text
     Aggregated 156,835 historical rows down to 200 hourly time-series points in 242 ms (~24 KB payload).
     ```
   - Switch between sensors (`SENSOR01` through `SENSOR09`) and watch the dynamic SVG time-series charts render instantly.
3. **Show Statistical Anomaly Detection:**
   - Point out the **Detected Anomalies** list at the bottom of the modal.
   - Explain how `SensorAnomalyDetector.java` identifies statistical outliers using configurable bounds ($[-30^\circ\text{C}, +40^\circ\text{C}]$, humidity $> 95\%$) and moving Z-score analysis ($|Z| > 2.5$).

---

### Phase 8: Clean Application Shutdown (30 Seconds)
1. **Close the Window:**
   - Click the standard "✕" close button on the top-right of the Edge App window.
2. **Observe the Terminal Supervisor:**
   - Show the PowerShell terminal:
     ```text
     [Supervisor] 3D Digital Twin window was closed by user.
     [Supervisor] Initiating clean shutdown of Java backend (PID: 12480)...
     Shutting down ColdFlow Server...
     ColdFlow Server stopped cleanly.
     [Supervisor] ColdFlow system shutdown complete. No orphaned processes remain.
     ```
3. **Conclusion:** *"Zero zombie Java processes, zero background memory leaks. ColdFlow manages its full lifecycle from start to finish."*

---

## 💡 Quick Q&A for Evaluators

**Q: Why Three.js over Unity or Unreal Engine?**  
*A: Three.js runs directly in a lightweight native webview without requiring heavy runtime engines (2GB+), long build times, or proprietary game engine licensing, while still providing full PBR materials, custom shaders, and 60 FPS performance.*

**Q: Why not Spring Boot for the backend?**  
*A: Spring Boot introduces 30MB+ of dependencies and a 3-5 second startup penalty. ColdFlow uses Java 21's native `HttpServer` with Project Loom virtual threads, starting in **under 800 milliseconds** with minimal memory usage.*

**Q: How do you guarantee C++ and Java twin parity?**  
*A: `ColdFlowEngineParityTest.java` runs 18 automated test vectors verifying boundary conditions, hysteresis cut-offs, rate-of-change damping, and circular buffer rolling averages. Both engines yield 100% identical outputs.*
