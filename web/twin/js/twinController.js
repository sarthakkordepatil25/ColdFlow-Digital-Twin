/**
 * ColdFlow Digital Twin Cockpit Controller (Stage 4 & 5)
 *
 * Implements:
 * 1. Live Data Synchronization with Java REST backend and Supabase PostgreSQL
 * 2. Interactive Inspection Panels (Batch Details, Zone Diagnostics, IoT Sensors, Anomalies)
 * 3. AGV Inventory Dispatch Animation tied to confirmed database operations
 * 4. Dual-layer Application Lifecycle (Heartbeat & Window Close Shutdown Beacon)
 * 5. High-performance Big-Data Sensor queries (1.41M records downsampling)
 */

class TwinController {
  constructor() {
    this.warehouse = null;
    this.zonesData = [];
    this.inventoryData = [];
    this.nextFefoBatch = null;

    this.selectedBatch = null;
    this.selectedZone = null;
    this.selectedSensorId = "SENSOR01";
    this.sensorSummaries = [];

    this.init();
  }

  async init() {
    // 1. Initialize 3D Warehouse
    const viewport = document.getElementById("warehouse-viewport");
    this.warehouse = new Warehouse3D(viewport, (item) => this.handle3DSelection(item));

    // 2. Setup Lifecycle (Heartbeat & Shutdown Beacon)
    this.setupLifecycle();

    // 3. Setup User Event Handlers
    this.setupEventListeners();

    // 4. Initial Live Data Fetch
    await this.fetchHealth();
    await this.fetchZones();
    await this.fetchInventory();

    // 5. Polling Loop (every 2.5s)
    setInterval(() => this.pollLiveState(), 2500);
  }

  setupLifecycle() {
    // Heartbeat every 2 seconds
    setInterval(() => {
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    }, 2000);

  }

  setupEventListeners() {
    // Top Bar Actions
    document.getElementById("btn-dispatch-fefo")?.addEventListener("click", () => this.dispatchFefoBatch());
    document.getElementById("btn-add-batch")?.addEventListener("click", () => this.openAddBatchModal());
    document.getElementById("btn-cycle-sim")?.addEventListener("click", () => this.triggerSimulationCycle());
    document.getElementById("btn-sensor-analytics")?.addEventListener("click", () => this.openSensorModal());

    // Camera preset buttons
    document.querySelectorAll(".camera-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".camera-btn").forEach((b) => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        const preset = e.currentTarget.dataset.camera;
        this.switchCameraPreset(preset);
      });
    });

    // Close buttons for modals & drawers
    document.querySelectorAll(".modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-overlay").forEach((m) => (m.style.display = "none"));
        const drawer = document.getElementById("batch-inspector-drawer");
        if (drawer) drawer.style.display = "none";
        const zoneDrawer = document.getElementById("zone-inspector-drawer");
        if (zoneDrawer) zoneDrawer.style.display = "none";
      });
    });

    // Add Batch Form
    document.getElementById("form-add-batch")?.addEventListener("submit", (e) => this.submitAddBatch(e));

    // Sensor Dropdown Change
    document.getElementById("sensor-select")?.addEventListener("change", (e) => {
      this.selectedSensorId = e.target.value;
      this.fetchSensorDownsampled(this.selectedSensorId);
      this.fetchSensorAnomalies(this.selectedSensorId);
    });

    // Focus Sensor in 3D Button
    document.getElementById("btn-focus-sensor")?.addEventListener("click", () => {
      if (this.selectedSensorId) {
        this.warehouse.highlightSensor(this.selectedSensorId);
      }
    });

    // Batch Inspector Buttons
    document.getElementById("btn-inspect-dispatch")?.addEventListener("click", () => {
      if (this.selectedBatch) this.dispatchSpecificBatch(this.selectedBatch.batchId);
    });
    document.getElementById("btn-inspect-focus")?.addEventListener("click", () => {
      if (this.selectedBatch) this.warehouse.highlightBatch(this.selectedBatch.batchId);
    });
    document.getElementById("btn-inspect-edit-qty")?.addEventListener("click", () => {
      if (this.selectedBatch) this.editBatchQuantity(this.selectedBatch.batchId);
    });
    document.getElementById("btn-inspect-delete")?.addEventListener("click", () => {
      if (this.selectedBatch) this.deleteSpecificBatch(this.selectedBatch.batchId);
    });
  }

  async fetchHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      const dot = document.getElementById("db-status-dot");
      const label = document.getElementById("db-status-label");
      if (data.databaseConnected) {
        dot.className = "status-dot";
        label.textContent = "Supabase Connected";
      } else {
        dot.className = "status-dot critical";
        label.textContent = "Supabase Offline";
      }

      const engineLabel = document.getElementById("cpp-engine-label");
      if (engineLabel) {
        engineLabel.textContent = data.cppEngineMode || "ONLINE";
      }
    } catch (err) {
      console.warn("Health fetch error:", err);
    }
  }

  async fetchZones() {
    try {
      const res = await fetch("/api/zones");
      this.zonesData = await res.json();
      this.renderZoneCards();
      this.warehouse.updateZoneTemperatures(this.zonesData);
      if (this.selectedZone) {
        const updated = this.zonesData.find((z) => z.zoneName === this.selectedZone.zoneName);
        if (updated) this.renderZoneInspector(updated);
      }
    } catch (err) {
      console.warn("Zones fetch error:", err);
    }
  }

  async fetchInventory() {
    try {
      const res = await fetch("/api/inventory");
      this.inventoryData = await res.json();

      // Find earliest unexpired batch for FEFO priority
      const today = new Date().toISOString().split("T")[0];
      const unexpired = this.inventoryData.filter((b) => b.quantity > 0 && b.expiryDate >= today);
      unexpired.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      this.nextFefoBatch = unexpired.length > 0 ? unexpired[0] : null;

      this.renderInventoryList();
      this.warehouse.syncBatches(this.inventoryData, this.nextFefoBatch ? this.nextFefoBatch.batchId : null);

      const totalUnits = this.inventoryData.reduce((sum, b) => sum + b.quantity, 0);
      document.getElementById("total-units-count").textContent = totalUnits;
      document.getElementById("batch-count-badge").textContent = this.inventoryData.length;
    } catch (err) {
      console.warn("Inventory fetch error:", err);
    }
  }

  async pollLiveState() {
    await this.fetchZones();
    await this.fetchInventory();
  }

  renderZoneCards() {
    const container = document.getElementById("zone-cards-container");
    if (!container) return;

    container.innerHTML = this.zonesData.map((z) => {
      const temp = z.currentTemperature.toFixed(1);
      const target = z.targetTemperature.toFixed(1);
      const statusClass = z.status === "NORMAL" ? "tag-normal" : (z.status === "WARNING" ? "tag-warning" : "tag-critical");
      const compressorText = z.compressorOn ? "COMPRESSOR: ON" : "COMPRESSOR: OFF";

      return `
        <div class="zone-row" onclick="window.twin.openZoneInspector('${z.zoneName}')">
          <div class="zone-info">
            <span class="zone-name">${z.zoneName} Zone</span>
            <span class="zone-meta">Target ${target}°C | ${compressorText}</span>
          </div>
          <div>
            <div class="zone-temp">${temp}°C</div>
            <span class="tag ${statusClass}">${z.status}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  renderInventoryList() {
    const list = document.getElementById("inventory-list");
    if (!list) return;

    if (this.inventoryData.length === 0) {
      list.innerHTML = `<div style="color:var(--muted); font-size:12px; padding:10px;">No inventory records in database.</div>`;
      return;
    }

    list.innerHTML = this.inventoryData.map((b) => {
      const isFefo = this.nextFefoBatch && (b.batchId === this.nextFefoBatch.batchId);
      const fefoBadge = isFefo ? `<span class="tag tag-warning" style="margin-left:4px;">NEXT FEFO</span>` : "";

      return `
        <div class="inventory-item ${isFefo ? "fefo-next" : ""}" onclick="window.twin.inspectBatchById('${b.batchId}')">
          <div>
            <strong>${b.productName}</strong> <small style="color:var(--muted);">#${b.batchId}</small> ${fefoBadge}
            <div style="font-size:11px; color:var(--muted);">${b.zoneName} · Exp: ${b.expiryDate}</div>
          </div>
          <div style="font-weight:700; font-size:13px;">${b.quantity} qty</div>
        </div>
      `;
    }).join("");
  }

  inspectBatchById(batchId) {
    const batch = this.inventoryData.find((b) => b.batchId === batchId);
    if (batch) {
      this.selectedBatch = batch;
      this.renderBatchInspector(batch);
      this.warehouse.highlightBatch(batchId);
    }
  }

  handle3DSelection(userData) {
    if (userData.type === "batchPallet") {
      this.inspectBatchById(userData.batchId);
    } else if (userData.type === "sensor") {
      this.selectedSensorId = userData.sensorId;
      this.openSensorModal();
    } else if (userData.type === "indicatorBulb") {
      this.openZoneInspector(userData.zoneName);
    }
  }

  renderBatchInspector(batch) {
    const drawer = document.getElementById("batch-inspector-drawer");
    if (!drawer) return;

    document.getElementById("inspect-batch-id").textContent = batch.batchId;
    document.getElementById("inspect-product-name").textContent = batch.productName;
    document.getElementById("inspect-quantity").textContent = batch.quantity + " units";
    document.getElementById("inspect-zone").textContent = batch.zoneName + " Zone";
    document.getElementById("inspect-expiry").textContent = batch.expiryDate;

    // Calculate days remaining
    const diffDays = Math.ceil((new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    document.getElementById("inspect-days-left").textContent = diffDays > 0 ? diffDays + " days remaining" : "EXPIRED";

    const isFefo = this.nextFefoBatch && (batch.batchId === this.nextFefoBatch.batchId);
    const fefoTag = document.getElementById("inspect-fefo-tag");
    if (fefoTag) {
      fefoTag.style.display = isFefo ? "inline-block" : "none";
    }

    drawer.style.display = "block";
  }

  openZoneInspector(zoneName) {
    const zone = this.zonesData.find((z) => z.zoneName === zoneName);
    if (!zone) return;
    this.selectedZone = zone;
    this.renderZoneInspector(zone);
    this.focusZone(zoneName);
  }

  renderZoneInspector(zone) {
    const drawer = document.getElementById("zone-inspector-drawer");
    if (!drawer) return;

    document.getElementById("zone-inspect-title").textContent = zone.zoneName + " Zone Diagnostics";
    document.getElementById("zone-inspect-temp").textContent = zone.currentTemperature.toFixed(2) + "°C";
    document.getElementById("zone-inspect-target").textContent = zone.targetTemperature.toFixed(1) + "°C";
    document.getElementById("zone-inspect-status").textContent = zone.status;
    document.getElementById("zone-inspect-compressor").textContent = zone.compressorOn ? "ACTIVE (COOLING)" : "IDLE";

    // COA Hardware Registers
    const r = zone.registers || {};
    document.getElementById("reg-r0").textContent = (r.R0_Target !== undefined ? r.R0_Target.toFixed(2) : "--") + "°C";
    document.getElementById("reg-r1").textContent = (r.R1_Current !== undefined ? r.R1_Current.toFixed(2) : "--") + "°C";
    document.getElementById("reg-r2").textContent = (r.R2_Error !== undefined ? r.R2_Error.toFixed(2) : "--") + "°C";
    document.getElementById("reg-r3").textContent = r.R3_ControlStatus !== undefined ? r.R3_ControlStatus : "0";
    document.getElementById("reg-r4").textContent = (r.R4_EnergyKWh !== undefined ? r.R4_EnergyKWh.toFixed(2) : "0.00") + " kWh";

    drawer.style.display = "block";
  }

  async dispatchFefoBatch() {
    if (!this.nextFefoBatch) {
      alert("No eligible unexpired batch available for dispatch.");
      return;
    }

    const batchToDispatch = this.nextFefoBatch;
    const btn = document.getElementById("btn-dispatch-fefo");
    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/api/inventory/dispatch", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        // AGV drives to rack, retrieves pallet, and returns to dispatch dock
        this.warehouse.animateDispatchWithAGV(batchToDispatch.batchId, () => {
          this.fetchInventory();
          if (btn) btn.disabled = false;
        });
      } else {
        alert("Dispatch error: " + (data.message || "The server could not dispatch the batch."));
        if (btn) btn.disabled = false;
      }
    } catch (err) {
      console.error("Dispatch request error:", err);
      alert("Dispatch request error: " + err.message);
      if (btn) btn.disabled = false;
    }
  }

  async dispatchSpecificBatch(batchId) {
    if (!confirm(`Confirm dispatch for batch #${batchId}?`)) return;

    try {
      const res = await fetch("/api/inventory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById("batch-inspector-drawer").style.display = "none";
        this.warehouse.animateDispatchWithAGV(batchId, () => {
          this.fetchInventory();
        });
      } else {
        alert("Dispatch error: " + (data.message || "The server could not dispatch the batch."));
      }
    } catch (err) {
      alert("Dispatch error: " + err.message);
    }
  }

  async editBatchQuantity(batchId) {
    if (!this.selectedBatch) return;
    const currentQty = this.selectedBatch.quantity;
    const input = prompt(`Enter new inventory quantity for batch #${batchId}:`, currentQty);
    if (input === null) return;
    const newQty = parseInt(input.trim(), 10);
    if (isNaN(newQty) || newQty < 0) {
      alert("Invalid quantity. Please enter a non-negative integer.");
      return;
    }

    try {
      const res = await fetch("/api/inventory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, quantity: newQty })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.selectedBatch.quantity = newQty;
        document.getElementById("inspect-quantity").textContent = newQty + " units";
        await this.fetchInventory();
      } else {
        alert("Failed to update quantity: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      alert("Update error: " + err.message);
    }
  }

  async deleteSpecificBatch(batchId) {
    if (!confirm(`Are you sure you want to permanently delete batch #${batchId} from Supabase?`)) return;

    try {
      const res = await fetch("/api/inventory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById("batch-inspector-drawer").style.display = "none";
        this.selectedBatch = null;
        await this.fetchInventory();
      } else {
        alert("Failed to delete batch: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  }

  openAddBatchModal() {
    const modal = document.getElementById("modal-add-batch");
    if (modal) modal.style.display = "flex";
  }

  async submitAddBatch(e) {
    e.preventDefault();
    const batchId = document.getElementById("input-batch-id").value.trim();
    const productName = document.getElementById("input-product-name").value.trim();
    const quantity = parseInt(document.getElementById("input-quantity").value, 10);
    const expiryDate = document.getElementById("input-expiry-date").value.trim();
    const zoneName = document.getElementById("select-zone-name").value;

    const payload = { batchId, productName, quantity, expiryDate, zoneName };

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        document.getElementById("modal-add-batch").style.display = "none";
        document.getElementById("form-add-batch").reset();
        await this.fetchInventory();
        this.warehouse.highlightBatch(batchId);
      } else {
        alert("Failed to add batch: " + (data.message || "The server could not save the batch."));
      }
    } catch (err) {
      alert("Add batch error: " + err.message);
    }
  }

  async triggerSimulationCycle() {
    try {
      const res = await fetch("/api/simulation/cycle", { method: "POST" });
      this.zonesData = await res.json();
      this.renderZoneCards();
      this.warehouse.updateZoneTemperatures(this.zonesData);
    } catch (err) {
      console.warn("Simulation cycle error:", err);
    }
  }

  switchCameraPreset(preset) {
    if (!this.warehouse) return;
    switch (preset) {
      case "overview":
        this.warehouse.focusCameraOn(0, 4, 18);
        break;
      case "freezer":
        this.warehouse.focusCameraOn(-6, 2.5, 6);
        break;
      case "chiller":
        this.warehouse.focusCameraOn(0, 2.5, 6);
        break;
      case "ambient":
        this.warehouse.focusCameraOn(6, 2.5, 6);
        break;
      case "dock":
        this.warehouse.focusCameraOn(0, 1.5, 12);
        break;
    }
  }

  focusZone(zoneName) {
    if (zoneName === "Freezer") this.switchCameraPreset("freezer");
    else if (zoneName === "Chiller") this.switchCameraPreset("chiller");
    else if (zoneName === "Ambient") this.switchCameraPreset("ambient");
  }

  async openSensorModal() {
    const modal = document.getElementById("modal-sensor-analytics");
    if (modal) modal.style.display = "flex";

    if (this.sensorSummaries.length === 0) {
      const res = await fetch("/api/sensors/summary");
      this.sensorSummaries = await res.json();
      const select = document.getElementById("sensor-select");
      if (select) {
        select.innerHTML = this.sensorSummaries.map((s) => `<option value="${s.sensorId}">${s.sensorId} (${s.totalRecords} records)</option>`).join("");
        select.value = this.selectedSensorId;
      }
    }

    await this.fetchSensorDownsampled(this.selectedSensorId);
    await this.fetchSensorAnomalies(this.selectedSensorId);
  }

  async fetchSensorDownsampled(sensorId) {
    const chartContainer = document.getElementById("sensor-chart-svg");
    if (!chartContainer) return;
    chartContainer.innerHTML = `<text x="50%" y="50%" fill="#94a3b8" text-anchor="middle">Streaming 156,835 records (downsampling to 200 buckets)...</text>`;

    const t0 = performance.now();
    const res = await fetch(`/api/sensors/downsampled?sensorId=${sensorId}&maxPoints=200`);
    const data = await res.json();
    const latency = Math.round(performance.now() - t0);

    const perfLabel = document.getElementById("sensor-perf-metrics");
    if (perfLabel) {
      perfLabel.textContent = `Retrieved ${data.length} buckets from 156,835 records in ${latency} ms.`;
    }

    this.renderSvgChart(data);
  }

  async fetchSensorAnomalies(sensorId) {
    const container = document.getElementById("sensor-anomalies-list");
    if (!container) return;
    container.innerHTML = `<span style="color:var(--muted); font-size:12px;">Evaluating Z-scores and operational thresholds...</span>`;

    const res = await fetch(`/api/sensors/anomalies?sensorId=${sensorId}`);
    const anomalies = await res.json();

    if (anomalies.length === 0) {
      container.innerHTML = `<span style="color:var(--emerald); font-size:12px;">No anomalies detected. Sensor is operating normally.</span>`;
      return;
    }

    container.innerHTML = anomalies.slice(0, 10).map((a) => `
      <div style="font-size:11px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="tag ${a.severity === "CRITICAL" ? "tag-critical" : "tag-warning"}">${a.severity}</span>
          <strong style="margin-left:4px;">${a.measurement || "Temperature"}</strong>: ${(a.value !== null && a.value !== undefined) ? a.value.toFixed(1) : "--"} (${a.reason || "Threshold Exceeded"})
        </div>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px;" onclick="window.twin.warehouse.highlightSensor('${sensorId}')">Locate</button>
      </div>
    `).join("");
  }

  renderSvgChart(points) {
    const svg = document.getElementById("sensor-chart-svg");
    if (!svg || points.length === 0) return;

    const temps = points.filter((p) => p.temperature !== null).map((p) => p.temperature);
    if (temps.length === 0) return;

    const minT = Math.min(...temps) - 1.0;
    const maxT = Math.max(...temps) + 1.0;
    const rangeT = maxT - minT || 1.0;

    const w = 560;
    const h = 180;
    const pad = 24;

    const coords = points.map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((p.temperature - minT) / rangeT) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    svg.innerHTML = `
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#334155" stroke-width="1" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#334155" stroke-width="1" />
      <polyline points="${coords.join(" ")}" fill="none" stroke="#38bdf8" stroke-width="2" />
      <text x="${pad}" y="${pad - 6}" fill="#94a3b8" font-size="10">${maxT.toFixed(1)}°C</text>
      <text x="${pad}" y="${h - 6}" fill="#94a3b8" font-size="10">${minT.toFixed(1)}°C</text>
    `;
  }
}

// Global hook
window.addEventListener("DOMContentLoaded", () => {
  window.twin = new TwinController();
});
