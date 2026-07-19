import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  updateDoc, 
  writeBatch,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Clean HTML tags completely while preserving normal characters (apostrophes, quotes)
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, "");
}

const firebaseConfig = {
  apiKey: "AIzaSyCOoiLrwUE02hQle1MsRJml34AMIf8kDSQ",
  authDomain: "royalcaribbean-52d0c.firebaseapp.com",
  projectId: "royalcaribbean-52d0c",
  storageBucket: "royalcaribbean-52d0c.firebasestorage.app",
  messagingSenderId: "129122385702",
  appId: "1:129122385702:web:21f1dd18abe8e2126ccbe7",
  measurementId: "G-4F588EC84Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const dealsCollection = collection(db, "promo_deals");
const configDocRef = doc(db, "settings", "discount_config");

let editingDealId = null; 
let activeDealsArray = []; 
let cachedReservations = []; // Stores real-time reservations for instant filtering & exporting
let currentResFilter = "all"; // Tracks selected reservation tab

const cancelEditBtn = document.getElementById("cancel-edit-btn");
const loginSection = document.getElementById("login-section");
const dashboardSection = document.getElementById("dashboard-section");

// Auth State Observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    document.body.className = "bg-gray-100 p-6"; 
    setupRealtimeAdminDeals();
    setupRealtimeConfig();
    setupRealtimeReservations();
  } else {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    document.body.className = "bg-gray-100 p-6 min-h-screen flex flex-col justify-center"; 
    
    if (unsubscribeDealsListener) {
      unsubscribeDealsListener();
      unsubscribeDealsListener = null;
    }
    if (unsubscribeConfigListener) {
      unsubscribeConfigListener();
      unsubscribeConfigListener = null;
    }
    if (unsubscribeReservationsListener) {
      unsubscribeReservationsListener();
      unsubscribeReservationsListener = null;
    }
  }
});

// Admin Login Form
const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.innerText = "Verifying...";
  loginBtn.disabled = true;

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error("Login Error:", error);
    alert("Incorrect admin credentials. Please try again.");
  } finally {
    loginBtn.innerText = "Log In";
    loginBtn.disabled = false;
  }
});

// Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  });
}

// Handle Promotion Creation / Edit Form Submissions
const form = document.getElementById("add-deal-form");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;

  const fileInput = document.getElementById("image-file");
  const file = fileInput.files[0];

  try {
    let imageUrl = null;

    if (file) {
      submitBtn.innerText = "Uploading Image...";
      const formData = new FormData();
      formData.append("image", file);

      const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=3e5ff15a3b468644796f99593098e15a`, {
        method: "POST",
        body: formData
      });

      const imgbbData = await imgbbResponse.json();
      imageUrl = imgbbData.data.url;
    }

    submitBtn.innerText = "Saving to Database...";

    const dealData = {
      title: sanitizeInput(document.getElementById("title").value),
      ship: sanitizeInput(document.getElementById("ship").value),
      port: sanitizeInput(document.getElementById("port").value),
      price: Number(document.getElementById("price").value),
      duration: sanitizeInput(document.getElementById("duration").value), 
      departureDate: sanitizeInput(document.getElementById("departureDate").value),
      category: document.getElementById("category").value,
      status: document.getElementById("status").value,
      interiorPrice: Number(document.getElementById("interiorPrice").value),
      outsidePrice: Number(document.getElementById("outsidePrice").value),
      balconyPrice: Number(document.getElementById("balconyPrice").value),
      suitePrice: Number(document.getElementById("suitePrice").value),
      roomImages: {
        interior: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80",
        outside: "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=600&q=80",
        balcony: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
        suite: "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=600&q=80"
      }
    };

    if (imageUrl) {
      dealData.imageUrl = imageUrl;
    }

    if (editingDealId) {
      const docRef = doc(db, "promo_deals", editingDealId);
      await updateDoc(docRef, dealData);
      alert("Promotion updated successfully!");
      editingDealId = null;
      cancelEditBtn.classList.add("hidden");
    } else {
      if (!imageUrl) {
        alert("Please upload an image for new promotions.");
        submitBtn.disabled = false;
        return;
      }
      dealData.createdAt = new Date().toISOString();
      await addDoc(dealsCollection, dealData);
      alert("Promotion published successfully!");
    }

    form.reset();
  } catch (error) {
    console.error("Error saving promo:", error);
    alert("An error occurred while saving.");
  } finally {
    submitBtn.innerText = editingDealId ? "Update Promotion" : "Publish Promotion";
    submitBtn.disabled = false;
  }
});

// Fetch Promotions List for Admin Dashboard (Real-time synced)
let unsubscribeDealsListener = null;

function setupRealtimeAdminDeals() {
  const listContainer = document.getElementById("admin-deals-list");
  listContainer.innerHTML = `<p class="text-sm text-gray-500">Connecting to real-time sync...</p>`;

  const q = query(dealsCollection, orderBy("createdAt", "desc"));

  unsubscribeDealsListener = onSnapshot(q, (snapshot) => {
    listContainer.innerHTML = "";
    activeDealsArray = []; 

    snapshot.forEach((docSnap) => {
      const deal = docSnap.data();
      const id = docSnap.id;

      activeDealsArray.push({ id, ...deal });

      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm border";
      
      const statusBadge = deal.status === "draft" 
        ? `<span class="bg-yellow-100 text-yellow-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-sans">Draft</span>`
        : `<span class="bg-green-100 text-green-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-sans">Active</span>`;

      item.innerHTML = `
        <div class="truncate mr-2 flex-grow">
          <div class="flex items-center space-x-2">
            <p class="font-bold truncate">${deal.title}</p>
            ${statusBadge}
          </div>
          <p class="text-xs text-gray-500">$${deal.price} • ${deal.category}</p>
        </div>
        <div class="flex space-x-2 shrink-0">
          <button onclick="prepareEdit('${id}')" class="text-blue-600 hover:text-blue-800 font-semibold text-xs">Edit</button>
          <button onclick="deleteDeal('${id}')" class="text-red-500 hover:text-red-700 font-semibold text-xs">Delete</button>
        </div>
      `;
      listContainer.appendChild(item);
    });
  }, (error) => {
    console.error("Admin listener error:", error);
  });
}

// Delete Promo
window.deleteDeal = async function(id) {
  if (confirm("Are you sure you want to delete this promotion?")) {
    try {
      const docRef = doc(db, "promo_deals", id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting deal:", error);
    }
  }
};

// Prepare the Form for Editing
window.prepareEdit = function(id) {
  const dealToEdit = activeDealsArray.find(deal => deal.id === id);
  if (!dealToEdit) return;

  editingDealId = id;

  document.getElementById("title").value = dealToEdit.title;
  document.getElementById("ship").value = dealToEdit.ship;
  document.getElementById("port").value = dealToEdit.port;
  document.getElementById("price").value = dealToEdit.price;
  document.getElementById("category").value = dealToEdit.category;
  document.getElementById("status").value = dealToEdit.status || "active";
  document.getElementById("duration").value = dealToEdit.duration || "";
  document.getElementById("departureDate").value = dealToEdit.departureDate || "";
  document.getElementById("interiorPrice").value = dealToEdit.interiorPrice || "";
  document.getElementById("outsidePrice").value = dealToEdit.outsidePrice || "";
  document.getElementById("balconyPrice").value = dealToEdit.balconyPrice || "";
  document.getElementById("suitePrice").value = dealToEdit.suitePrice || "";

  submitBtn.innerText = "Update Promotion";
  cancelEditBtn.classList.remove("hidden");
  
  form.scrollIntoView({ behavior: 'smooth' });
};

// Cancel Edit Mode
cancelEditBtn.addEventListener("click", () => {
  editingDealId = null;
  form.reset();
  document.getElementById("status").value = "active";
  submitBtn.innerText = "Publish Promotion";
  cancelEditBtn.classList.add("hidden");
});

// Bulk JSON Import Handler
const bulkFileInput = document.getElementById("bulk-json-file");
const bulkImportBtn = document.getElementById("bulk-import-btn");

bulkImportBtn.addEventListener("click", () => {
  const file = bulkFileInput.files[0];
  if (!file) {
    alert("Please select a valid .json file first.");
    return;
  }

  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const cruises = JSON.parse(e.target.result);
      
      if (!Array.isArray(cruises)) {
        alert("Import failed: JSON file must contain an array.");
        return;
      }

      bulkImportBtn.innerText = "Importing Batch...";
      bulkImportBtn.disabled = true;

      const batch = writeBatch(db);
      
      cruises.forEach((cruise) => {
        const newDocRef = doc(collection(db, "promo_deals"));
        batch.set(newDocRef, {
          title: sanitizeInput(cruise.title),
          ship: sanitizeInput(cruise.ship),
          port: sanitizeInput(cruise.port),
          price: Number(cruise.price),
          duration: sanitizeInput(cruise.duration || "7 Nights"),
          category: cruise.category,
          status: cruise.status || "active",
          imageUrl: cruise.imageUrl || "https://images.unsplash.com/photo-1548574505-5e239809ee19",
          departureDate: sanitizeInput(cruise.departureDate || ""),
          interiorPrice: Number(cruise.interiorPrice || cruise.price),
          outsidePrice: Number(cruise.outsidePrice || (cruise.price + 200)),
          balconyPrice: Number(cruise.balconyPrice || (cruise.price + 150)),
          suitePrice: Number(cruise.suitePrice || (cruise.price * 2)),
          roomImages: cruise.roomImages || {
            interior: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&q=80",
            outside: "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=600&q=80",
            balcony: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
            suite: "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=600&q=80"
          },
          createdAt: new Date().toISOString()
        });
      });

      await batch.commit();
      alert(`Import Successful! ${cruises.length} promotions added.`);
      bulkFileInput.value = ""; 
    } catch (error) {
      console.error("Bulk Import Error:", error);
      alert("Error parsing or writing JSON.");
    } finally {
      bulkImportBtn.innerText = "Start Bulk Import";
      bulkImportBtn.disabled = false;
    }
  };

  reader.readAsText(file);
});

// Global Discount Config Handler
let unsubscribeConfigListener = null;
const discountPercentInput = document.getElementById("discount-percent");
const discountActiveInput = document.getElementById("discount-active");
const saveDiscountBtn = document.getElementById("save-discount-btn");

function setupRealtimeConfig() {
  unsubscribeConfigListener = onSnapshot(configDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      discountPercentInput.value = data.percentage !== undefined ? data.percentage : "";
      discountActiveInput.checked = !!data.isActive;
    } else {
      discountPercentInput.value = "";
      discountActiveInput.checked = false;
    }
  }, (error) => {
    console.error("Error reading config:", error);
  });
}

saveDiscountBtn.addEventListener("click", async () => {
  const percentage = Number(discountPercentInput.value);
  const isActive = discountActiveInput.checked;

  if (isNaN(percentage) || percentage < 0 || percentage > 100) {
    alert("Please enter a valid percentage between 0 and 100.");
    return;
  }

  saveDiscountBtn.disabled = true;
  saveDiscountBtn.innerText = "Saving...";

  try {
    await setDoc(configDocRef, {
      percentage: percentage,
      isActive: isActive,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    alert("Discount settings updated successfully!");
  } catch (error) {
    console.error("Error saving config:", error);
    alert("An error occurred while saving configuration.");
  } finally {
    saveDiscountBtn.disabled = false;
    saveDiscountBtn.innerText = "Save Discount Settings";
  }
});

// Global Toggle for Passenger Details Accordion
window.togglePassengerDropdown = function(id) {
  const target = document.getElementById(`companions-${id}`);
  if (target) {
    target.classList.toggle("hidden");
  }
};

// Global helper for remaining time left formatting (Active holds)
function formatTimeLeft(expISO) {
  if (!expISO) return "N/A";
  const exp = new Date(expISO);
  const now = new Date();
  const diffMs = exp - now;

  if (diffMs <= 0) return "Expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m left`;
}

// Global Export CSV Logic
function handleCSVExport() {
  const visibleRes = getFilteredReservationsList();
  if (visibleRes.length === 0) {
    alert("No active reservations match your current filter settings to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Hold Reference,Booking Status,Lead Traveler Name,Residence Country,Email Address,Phone Number,Loyalty Membership,Cruise Name,Selected Ship,Departure Date,Stateroom Category,Total Passengers,Companion Passenger Names & Ages,Estimated Fare Total,Hold Expiration Date,Creation Date\r\n";

  visibleRes.forEach(res => {
    const lead = res.leadGuest || {};
    const details = res.bookingDetails || {};
    const pricing = res.pricing || {};
    
    const companionData = (res.additionalGuests || [])
      .map(guest => `${guest.name || "N/A"} (${guest.age || "N/A"}yo)`)
      .join("; ");

    const line = [
      res.id,
      res.status,
      `"${(lead.name || "").replace(/"/g, '""')}"`,
      `"${(lead.country || "").replace(/"/g, '""')}"`,
      lead.email || "N/A",
      lead.phone || "N/A",
      lead.loyaltyNumber || "Not Provided",
      `"${(details.cruiseTitle || "").replace(/"/g, '""')}"`,
      details.shipName || "N/A",
      details.departureDate || "N/A",
      details.stateroomType || "Interior",
      details.guestCount || 1,
      `"${companionData.replace(/"/g, '""')}"`,
      pricing.estimatedTotal || 0,
      res.holdUntil || "N/A",
      res.createdAt || "N/A"
    ];

    csvContent += line.join(",") + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const downloadLink = document.createElement("a");
  downloadLink.setAttribute("href", encodedUri);
  downloadLink.setAttribute("download", `PromoHub_Holds_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// Client-side helper function to return a filtered subset of stored holds
function getFilteredReservationsList() {
  const now = new Date();
  return cachedReservations.filter(res => {
    const expiration = res.holdUntil ? new Date(res.holdUntil) : null;
    const isExpired = expiration && now > expiration;

    if (currentResFilter === "active") {
      return res.status === "hold" && !isExpired;
    }
    if (currentResFilter === "paid") {
      return res.status === "paid";
    }
    if (currentResFilter === "expired") {
      return res.status === "hold" && isExpired;
    }
    return true; // "all" tab
  });
}

// Master Client-side Renderer for Synchronized Reservation Holds
function renderReservationsUI() {
  const listContainer = document.getElementById("admin-reservations-list");
  const countBadge = document.getElementById("reservation-count-badge");
  const now = new Date();

  const subsetToRender = getFilteredReservationsList();
  
  countBadge.innerText = `${subsetToRender.length} Holds`;
  listContainer.innerHTML = "";

  if (subsetToRender.length === 0) {
    listContainer.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500 font-semibold">No reservations found matching the current filter tab.</td></tr>`;
    return;
  }

  subsetToRender.forEach((res) => {
    const id = res.id;
    const lead = res.leadGuest || { name: "N/A", email: "N/A", phone: "N/A", country: "United States", loyaltyNumber: null };
    const details = res.bookingDetails || { cruiseTitle: "N/A", shipName: "N/A", stateroomType: "Interior", guestCount: 1, departureDate: "N/A" };
    const pricing = res.pricing || { baseFare: 0, discountsApplied: 0, taxesAndFees: 0, estimatedTotal: 0 };
    const companions = res.additionalGuests || [];

    const expiration = res.holdUntil ? new Date(res.holdUntil) : null;
    const isExpired = expiration && now > expiration;

    // A: Hold Status Logic & Countdown Labels
    let statusBadgeHTML = "";
    let expirationLabelHTML = "";
    let rowClasses = "hover:bg-gray-50/50 transition-colors";

    if (res.status === "paid") {
      statusBadgeHTML = `<span class="bg-green-100 text-green-800 text-[10px] font-black px-2 py-0.5 rounded uppercase font-sans">✓ Paid</span>`;
      expirationLabelHTML = `<span class="text-gray-400 font-bold block text-[11px]">Paid Booking</span>`;
    } else {
      if (isExpired) {
        statusBadgeHTML = `<span class="bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded uppercase font-sans">Expired</span>`;
        expirationLabelHTML = `<span class="text-red-600 font-extrabold block text-[11px]">Expired Hold</span>`;
        rowClasses += " opacity-60 bg-gray-50/30"; // Dimming expired holds for visual prioritization
      } else {
        const timeLeft = formatTimeLeft(res.holdUntil);
        statusBadgeHTML = `<span class="bg-yellow-100 text-yellow-800 text-[10px] font-black px-2 py-0.5 rounded uppercase font-sans">Hold</span>`;
        expirationLabelHTML = `<span class="text-emerald-600 font-extrabold block text-[11px]">${timeLeft}</span>`;
      }
    }

    // B: Lead Guest Country & Optional Loyalty membership display
    const loyaltyBadgeHTML = lead.loyaltyNumber 
      ? `<div class="mt-1.5 inline-block bg-blue-50 text-blue-800 border border-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-sans tracking-wide">Crown & Anchor: #${sanitizeInput(lead.loyaltyNumber)}</div>` 
      : "";

    const leadInfoHTML = `
      <div>
        <span class="font-bold text-gray-800 block">${sanitizeInput(lead.name)} (${sanitizeInput(lead.country || "United States")})</span>
        <span class="text-gray-500 block text-[11px]">${sanitizeInput(lead.email)}</span>
        <span class="text-gray-500 block text-[11px]">${sanitizeInput(lead.phone)}</span>
        ${loyaltyBadgeHTML}
      </div>
    `;

    // C: Traveling Companions (Interactive details drawer)
    let companionsHTML = "";
    let togglerButtonHTML = "";

    if (companions.length > 0) {
      togglerButtonHTML = `
        <button onclick="togglePassengerDropdown('${id}')" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] underline ml-1.5 uppercase tracking-wider">View Passengers (${companions.length + 1})</button>
      `;

      let listItemsHTML = "";
      companions.forEach((g, idx) => {
        listItemsHTML += `
          <div class="flex justify-between py-1 border-b border-gray-100 last:border-none">
            <span>Guest ${idx + 2}: ${sanitizeInput(g.name)}</span>
            <span class="text-gray-400">Age: ${g.age}</span>
          </div>
        `;
      });

      companionsHTML = `
        <div id="companions-${id}" class="mt-2 hidden bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[10px] text-gray-600 font-medium space-y-1 shadow-inner">
          <p class="font-black text-blue-900 uppercase tracking-widest text-[8px] mb-1.5 pb-1 border-b">Companion Passengers</p>
          <div class="flex justify-between py-1 border-b border-gray-100">
            <span>Guest 1: ${sanitizeInput(lead.name)} (Lead)</span>
            <span class="text-gray-400">Primary</span>
          </div>
          ${listItemsHTML}
        </div>
      `;
    }

    const createdDate = res.createdAt ? new Date(res.createdAt).toLocaleString() : "N/A";
    const expirationDate = res.holdUntil ? new Date(res.holdUntil).toLocaleString() : "N/A";

    let actionButtons = "";
    if (res.status === "hold") {
      actionButtons = `
        <button onclick="updateReservationStatus('${id}', 'paid')" class="bg-green-600 hover:bg-green-700 text-white font-bold px-2 py-1 rounded text-[10px] transition-all">Mark Paid</button>
      `;
    } else if (res.status === "paid") {
      actionButtons = `
        <button onclick="updateReservationStatus('${id}', 'hold')" class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-2 py-1 rounded text-[10px] transition-all">Restore Hold</button>
      `;
    }

    actionButtons += `
      <button onclick="deleteReservation('${id}')" class="text-red-500 hover:text-red-700 font-semibold text-[10px] ml-2">Delete</button>
    `;

    const row = document.createElement("tr");
    row.className = rowClasses;
    row.innerHTML = `
      <td class="p-3 align-top">
        <span class="font-mono font-bold text-gray-800 block">${id}</span>
        <div class="mt-1">${statusBadgeHTML}</div>
      </td>
      <td class="p-3 align-top">
        ${leadInfoHTML}
      </td>
      <td class="p-3 align-top max-w-xs">
        <span class="font-bold text-blue-900 block truncate" title="${sanitizeInput(details.cruiseTitle)}">${sanitizeInput(details.cruiseTitle)}</span>
        <span class="text-gray-500 block text-[11px]">${sanitizeInput(details.shipName)} • ${sanitizeInput(details.departureDate)}</span>
        <span class="text-gray-500 block text-[11px] font-medium">${sanitizeInput(details.stateroomType)} Cabin • ${details.guestCount} Guest(s) ${togglerButtonHTML}</span>
        ${companionsHTML}
      </td>
      <td class="p-3 align-top">
        <span class="font-bold text-gray-800 block">$${pricing.estimatedTotal.toLocaleString()}</span>
        <span class="text-gray-400 block text-[10px]">Fare: $${pricing.baseFare.toLocaleString()}</span>
        <span class="text-emerald-600 block text-[10px]">Saved: -$${pricing.discountsApplied.toLocaleString()}</span>
        <span class="text-gray-400 block text-[10px]">Taxes: $${pricing.taxesAndFees.toLocaleString()}</span>
      </td>
      <td class="p-3 align-top">
        ${expirationLabelHTML}
        <span class="text-gray-400 block text-[10px] mt-1">Exp: ${expirationDate}</span>
        <span class="text-gray-400 block text-[10px]">Created: ${createdDate}</span>
      </td>
      <td class="p-3 align-top text-right">
        <div class="flex items-center justify-end space-x-1">
          ${actionButtons}
        </div>
      </td>
    `;
    listContainer.appendChild(row);
  });
}

// Fetch Reservation Holds List for Admin Dashboard (Real-time synced)
let unsubscribeReservationsListener = null;

function setupRealtimeReservations() {
  const listContainer = document.getElementById("admin-reservations-list");
  listContainer.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">Connecting to reservations sync...</td></tr>`;

  const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));

  unsubscribeReservationsListener = onSnapshot(q, (snapshot) => {
    cachedReservations = [];

    snapshot.forEach((docSnap) => {
      cachedReservations.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderReservationsUI();
  }, (error) => {
    console.error("Reservations Sync Error:", error);
    listContainer.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Failed to sync reservations data: ${error.message}</td></tr>`;
  });
}

// Helper to switch Reservation holds tabs
function setReservationFilter(filterVal) {
  const buttons = document.querySelectorAll(".res-filter-btn");
  buttons.forEach(btn => {
    btn.className = "res-filter-btn px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-600 hover:text-blue-900 transition-all";
  });

  const activeBtnMap = {
    all: "filter-res-all",
    active: "filter-res-active",
    paid: "filter-res-paid",
    expired: "filter-res-expired"
  };

  const activeBtn = document.getElementById(activeBtnMap[filterVal]);
  if (activeBtn) {
    activeBtn.className = "res-filter-btn px-3 py-1.5 text-xs font-bold rounded-lg bg-white shadow-sm text-blue-900 transition-all";
  }

  currentResFilter = filterVal;
  renderReservationsUI();
}

// Global action to update reservation status
window.updateReservationStatus = async function(id, newStatus) {
  try {
    const docRef = doc(db, "reservations", id);
    await updateDoc(docRef, { status: newStatus });
  } catch (error) {
    console.error("Error updating reservation:", error);
    alert("An error occurred while updating status.");
  }
};

// Global action to delete reservation
window.deleteReservation = async function(id) {
  if (confirm("Are you sure you want to delete this reservation permanently? This action cannot be undone.")) {
    try {
      const docRef = doc(db, "reservations", id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting reservation:", error);
      alert("An error occurred while deleting the reservation.");
    }
  }
};

// Setup Interactive Action Listeners inside Admin Panels
function setupAdminPanelListeners() {
  document.getElementById("filter-res-all").addEventListener("click", () => setReservationFilter("all"));
  document.getElementById("filter-res-active").addEventListener("click", () => setReservationFilter("active"));
  document.getElementById("filter-res-paid").addEventListener("click", () => setReservationFilter("paid"));
  document.getElementById("filter-res-expired").addEventListener("click", () => setReservationFilter("expired"));
  document.getElementById("export-csv-btn").addEventListener("click", handleCSVExport);
}

setupInteractiveListeners();
setupAdminPanelListeners();