
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const dealsCollection = collection(db, "promo_deals");
const configDocRef = doc(db, "settings", "discount_config");

let allDeals = [];
let filteredDeals = [];
let displayedLimit = 15;
let currentCategory = "all";
let currentDealInModal = null;
let currentStep = 1; 
let discountConfig = { percentage: 0, isActive: false };

// Dynamic Dates Tracker Variables
let selectedDateObj = null;

// Convert YYYY-MM-DD back into clean readable text formats (e.g., Jul 24, 2026)
function formatDateFriendly(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function initializePromoFinder() {
  const grid = document.getElementById('deals-grid');
  grid.innerHTML = '<p class="text-center text-gray-500 col-span-3 py-12">Loading promotions...</p>';

  try {
    try {
      const configSnap = await getDoc(configDocRef);
      if (configSnap.exists()) {
        discountConfig = configSnap.data();
      }
    } catch (configError) {
      console.error("Error fetching global configurations:", configError);
    }

    const q = query(dealsCollection, where("status", "==", "active"));
    const snapshot = await getDocs(q);
    
    allDeals = [];
    snapshot.forEach((docSnap) => {
      allDeals.push({ id: docSnap.id, ...docSnap.data() });
    });

    populateShipFilter();
    applyInteractiveFilters();

    startUrgencyCountdown();
    startLiveActivityFeed();
    checkDeepLink();

  } catch (error) {
    console.error("Error starting app database cache:", error);
    grid.innerHTML = '<p class="text-center text-red-500 col-span-3 py-12">Failed to load real-time promotional data.</p>';
  }
}

function populateShipFilter() {
  const select = document.getElementById("ship-filter");
  const uniqueShips = [...new Set(allDeals.map(deal => deal.ship).filter(Boolean))].sort();
  
  uniqueShips.forEach(ship => {
    const opt = document.createElement("option");
    opt.value = ship;
    opt.innerText = ship;
    select.appendChild(opt);
  });
}

function applyInteractiveFilters() {
  const searchVal = document.getElementById("search-input").value.toLowerCase().trim();
  const shipVal = document.getElementById("ship-filter").value;
  const portVal = document.getElementById("port-filter").value.toLowerCase().trim();
  const priceMax = Number(document.getElementById("price-filter").value);

  filteredDeals = allDeals.filter(deal => {
    if (currentCategory !== "all" && deal.category !== currentCategory) return false;
    if (searchVal && !deal.title.toLowerCase().includes(searchVal)) return false;
    if (shipVal !== "all" && deal.ship !== shipVal) return false;
    if (portVal && !deal.port.toLowerCase().includes(portVal)) return false;
    if (deal.price > priceMax) return false;
    return true;
  });

  displayedLimit = 15;
  renderCachedDeals();
}

function renderCachedDeals() {
  const grid = document.getElementById('deals-grid');
  const loadMoreBtnContainer = document.getElementById('load-more-container');
  const filterMeta = document.getElementById("filter-meta-info");
  const filteredCountText = document.getElementById("filtered-count");

  grid.innerHTML = '';

  if (filteredDeals.length === 0) {
    grid.innerHTML = '<p class="text-center text-gray-500 col-span-3 py-12">No active promos found matching these specific filters.</p>';
    loadMoreBtnContainer.classList.add("hidden");
    filterMeta.classList.add("hidden");
    return;
  }

  filterMeta.classList.remove("hidden");
  filteredCountText.innerText = filteredDeals.length;

  const subsetToRender = filteredDeals.slice(0, displayedLimit);
  const isPromoActive = discountConfig && discountConfig.isActive && discountConfig.percentage > 0;

  subsetToRender.forEach(deal => {
    const originalPrice = Number(deal.price);
    let priceHTML = '';
    let discountBadgeHTML = '';

    if (isPromoActive) {
      const discountedPrice = Math.round(originalPrice * (1 - (discountConfig.percentage / 100)));
      priceHTML = `
        <p class="text-2xl font-black text-blue-900">$${discountedPrice} <span class="text-xs font-normal text-gray-500">USD / PP</span></p>
        <p class="text-[11px] text-gray-400 font-semibold line-through">Original Price: $${originalPrice}</p>
      `;
      discountBadgeHTML = `
        <span class="absolute top-3 right-3 bg-pink-600 text-white text-[10px] font-black px-2.5 py-1.5 rounded-md shadow-md uppercase tracking-wider z-10">
          🔥 ${discountConfig.percentage}% OFF
        </span>
      `;
    } else {
      priceHTML = `
        <p class="text-2xl font-black text-blue-900">$${originalPrice} <span class="text-xs font-normal text-gray-500">USD / PP</span></p>
      `;
    }

    const card = `
      <div class="bg-white rounded-xl overflow-hidden shadow-md border border-gray-100 flex flex-col justify-between hover:shadow-lg transition-all duration-300 relative">
        <div class="relative">
          <img src="${deal.imageUrl}" class="h-48 w-full object-cover" alt="${deal.title}">
          <span class="absolute top-3 left-3 bg-blue-900/90 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow-md uppercase tracking-wider">
            📅 ${deal.departureDate || 'Select Dates'}
          </span>
          ${discountBadgeHTML}
        </div>
        <div class="p-6 flex-grow flex flex-col justify-between relative">
          <div class="space-y-1 pr-8">
            <p class="text-xs font-extrabold text-pink-600 uppercase tracking-widest">${deal.duration || '7 Nights'} • ${deal.ship}</p>
            <h3 class="text-lg font-black text-gray-800 leading-tight">${deal.title}</h3>
            <p class="text-sm text-gray-500 font-medium">${deal.port}</p>
          </div>

          <button class="share-deal-btn absolute top-6 right-6 text-gray-300 hover:text-blue-900 transition-colors p-1 hover:bg-gray-50 rounded-lg" data-id="${deal.id}" title="Copy Link to Deal">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 10.742l4.572-2.286m0 0a3 3 0 114.39 2.599l-4.57 2.286m-4.592 2.286a3 3 0 11-4.885-3.18a3.003 3.003 0 014.885 3.18zm8.478-.853a3 3 0 11-4.392 2.599V14.5" />
            </svg>
          </button>

          <div class="pt-6 flex items-end justify-between border-t border-gray-50 mt-6 w-full">
            <div>
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Starting from*</p>
              ${priceHTML}
            </div>
            <button class="claim-deal-btn bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors" data-id="${deal.id}">Claim Deal</button>
          </div>
        </div>
      </div>
    `;
    grid.innerHTML += card;
  });

  if (filteredDeals.length > displayedLimit) {
    loadMoreBtnContainer.classList.remove("hidden");
  } else {
    loadMoreBtnContainer.classList.add("hidden");
  }

  setupClaimListeners(); 
  setupShareListeners();
}

function setupInteractiveListeners() {
  const searchInput = document.getElementById("search-input");
  const shipFilter = document.getElementById("ship-filter");
  const portFilter = document.getElementById("port-filter");
  const priceFilter = document.getElementById("price-filter");
  const priceDisplay = document.getElementById("price-limit-display");

  searchInput.addEventListener("input", applyInteractiveFilters);
  shipFilter.addEventListener("change", applyInteractiveFilters);
  portFilter.addEventListener("input", applyInteractiveFilters);
  
  priceFilter.addEventListener("input", (e) => {
    priceDisplay.innerText = `$${Number(e.target.value).toLocaleString()}`;
    applyInteractiveFilters();
  });

  const loadMoreBtn = document.getElementById("load-more-btn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      displayedLimit += 15;
      renderCachedDeals();
    });
  }

  const buttons = document.querySelectorAll(".filter-btn");
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const category = button.getAttribute("data-category");
      if (category === currentCategory) return;

      buttons.forEach(btn => {
        btn.className = "filter-btn px-5 py-2.5 font-semibold rounded-lg text-gray-600 hover:bg-gray-100 transition-all text-sm";
      });

      button.className = "filter-btn px-5 py-2.5 font-bold rounded-lg bg-blue-900 text-white shadow-sm transition-all text-sm";

      currentCategory = category;
      applyInteractiveFilters();
    });
  });
}

function setStep(targetStep) {
  currentStep = targetStep;

  const s1 = document.getElementById("step-1-view");
  const s2 = document.getElementById("step-2-view");
  const s3 = document.getElementById("step-3-view");

  const prevBtn = document.getElementById("prev-step-btn");
  const nextBtn = document.getElementById("next-step-btn");
  const mobileNextBtn = document.getElementById("mobile-next-step-btn");

  const dot1 = document.getElementById("step-dot-1");
  const dot2 = document.getElementById("step-dot-2");
  const dot3 = document.getElementById("step-dot-3");

  const label1 = document.getElementById("step-label-1");
  const label2 = document.getElementById("step-label-2");
  const label3 = document.getElementById("step-label-3");

  s1.classList.add("hidden");
  s2.classList.add("hidden");
  s3.classList.add("hidden");

  if (currentStep === 1) {
    s1.classList.remove("hidden");
    prevBtn.classList.add("hidden");
    nextBtn.innerText = "Continue to Guests ➔";
    mobileNextBtn.innerText = "Continue to Guests";
  } else if (currentStep === 2) {
    s2.classList.remove("hidden");
    prevBtn.classList.remove("hidden");
    nextBtn.innerText = "Continue to Review ➔";
    mobileNextBtn.innerText = "Continue to Review";
    generateAdditionalGuestForms();
  } else if (currentStep === 3) {
    s3.classList.remove("hidden");
    prevBtn.classList.remove("hidden");
    nextBtn.innerText = "Confirm & Lock Rate";
    mobileNextBtn.innerText = "Confirm & Lock Rate";
    populateReviewDetails();
  }

  dot1.className = `h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep >= 1 ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-400'}`;
  dot2.className = `h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep >= 2 ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-400'}`;
  dot3.className = `h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep >= 3 ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-400'}`;

  label1.className = `text-xs font-bold transition-all ${currentStep >= 1 ? 'text-blue-900' : 'text-gray-400'}`;
  label2.className = `text-xs font-bold transition-all ${currentStep >= 2 ? 'text-blue-900' : 'text-gray-400'}`;
  label3.className = `text-xs font-bold transition-all ${currentStep >= 3 ? 'text-blue-900' : 'text-gray-400'}`;

  dot1.innerHTML = currentStep > 1 ? "✓" : "1";
  dot2.innerHTML = currentStep > 2 ? "✓" : "2";
  dot3.innerHTML = "3";
}

function generateAdditionalGuestForms() {
  const container = document.getElementById("additional-guests-container");
  container.innerHTML = "";

  const guestCount = Number(document.getElementById("guest-count-select").value);
  if (guestCount > 1) {
    container.classList.remove("hidden");

    const dividerTitle = document.createElement("p");
    dividerTitle.className = "text-xs font-black uppercase text-blue-900 tracking-wider mb-3 mt-4 border-t pt-4 border-gray-100";
    dividerTitle.innerText = "Companion Guests Info";
    container.appendChild(dividerTitle);

    for (let i = 2; i <= guestCount; i++) {
      const formBlock = document.createElement("div");
      formBlock.className = "grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-100 p-4 rounded-xl bg-slate-50/50 mb-3";
      formBlock.innerHTML = `
        <div>
          <label class="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-wider">Guest ${i} Full Name</label>
          <input type="text" class="additional-guest-name w-full border border-gray-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white" placeholder="Passenger Name" required>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-wider">Guest ${i} Age</label>
          <input type="number" min="0" max="110" class="additional-guest-age w-full border border-gray-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white" placeholder="Age" required>
        </div>
      `;
      container.appendChild(formBlock);
    }
  } else {
    container.classList.add("hidden");
  }
}

function populateReviewDetails() {
  const reviewWrapper = document.getElementById("step-3-review-container");
  
  const selectedRadio = document.querySelector('input[name="stateroom"]:checked');
  const cabinExperience = selectedRadio ? selectedRadio.value : "Interior";
  
  const leadName = document.getElementById("guest-name").value.trim();
  const leadCountry = document.getElementById("guest-country").value.trim();
  const leadEmail = document.getElementById("guest-email").value.trim();
  const leadPhone = document.getElementById("guest-phone").value.trim();
  const leadLoyalty = document.getElementById("guest-loyalty").value.trim() || "Not provided";

  // Displaying sailing dates
  let sailingDatesText = currentDealInModal.departureDate || "Selected Date";
  if (selectedDateObj) {
    sailingDatesText = `${formatDateFriendly(selectedDateObj.departure)} - ${formatDateFriendly(selectedDateObj.return)}`;
  }

  const names = document.querySelectorAll(".additional-guest-name");
  const ages = document.querySelectorAll(".additional-guest-age");
  let companionsHTML = "";

  if (names.length > 0) {
    companionsHTML = `<div class="border-t pt-3 mt-3 space-y-1">
      <p class="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Companion Passengers</p>`;
    for (let i = 0; i < names.length; i++) {
      companionsHTML += `<p class="text-xs text-gray-700"><strong>Guest ${i+2}:</strong> ${names[i].value.trim()} (Age: ${ages[i].value.trim()})</p>`;
    }
    companionsHTML += `</div>`;
  }

  reviewWrapper.innerHTML = `
    <div class="space-y-4 border border-gray-100 p-4 rounded-xl bg-blue-50/50">
      <div>
        <p class="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Selected Option</p>
        <p class="text-sm font-black text-blue-950">${cabinExperience} Experience</p>
        <p class="text-xs text-gray-600">${currentDealInModal.ship} • Departing ${sailingDatesText}</p>
      </div>

      <div class="border-t pt-3 space-y-1">
        <p class="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Primary Passenger Details</p>
        <p class="text-xs text-gray-700"><strong>Lead Name:</strong> ${leadName}</p>
        <p class="text-xs text-gray-700"><strong>Country of Residence:</strong> ${leadCountry}</p>
        <p class="text-xs text-gray-700"><strong>Email:</strong> ${leadEmail}</p>
        <p class="text-xs text-gray-700"><strong>Phone:</strong> ${leadPhone}</p>
        <p class="text-xs text-gray-700"><strong>Crown & Anchor Loyalty #:</strong> ${leadLoyalty}</p>
      </div>

      ${companionsHTML}
    </div>
  `;
}

function openDealModal(deal) {
  const modal = document.getElementById("promo-modal");
  const formContainer = document.getElementById("express-form-container");
  const loadingState = document.getElementById("booking-loading");
  const successState = document.getElementById("booking-success");
  const toggleSummaryBtn = document.getElementById("toggle-summary-btn");
  const summaryBreakdown = document.getElementById("summary-breakdown-details");
  const navControls = document.getElementById("modal-nav-controls");

  // Dynamic Dates Selector Containers
  const datesContainer = document.getElementById("modal-dates-container");
  const datesCarousel = document.getElementById("modal-dates-carousel");

  currentDealInModal = deal;
  selectedDateObj = null;

  document.body.classList.add("modal-active");
  const liveActivity = document.getElementById("live-activity-container");
  if (liveActivity) {
    liveActivity.classList.add("hidden");
  }
  
  document.getElementById("modal-cruise-title").innerText = deal.title;
  document.getElementById("modal-cruise-ship").innerText = `${deal.ship} • Departing ${deal.departureDate || 'Selected Date'}`;

  // Rendering horizontal dates scrolling selector panel [4]
  if (deal.dates && Array.isArray(deal.dates) && deal.dates.length > 0) {
    datesContainer.classList.remove("hidden");
    datesCarousel.innerHTML = "";

    // Set first date selected by default
    selectedDateObj = deal.dates[0];

    deal.dates.forEach((date, idx) => {
      const depFriendly = formatDateFriendly(date.departure);
      const retFriendly = formatDateFriendly(date.return);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `date-card-btn shrink-0 border-2 rounded-xl p-3 text-left w-36 transition-all focus:outline-none ${idx === 0 ? 'border-blue-900 bg-blue-50/30' : 'border-gray-200 hover:border-blue-900'}`;
      btn.setAttribute("data-index", idx);
      btn.innerHTML = `
        <p class="text-[9px] uppercase font-black text-gray-400">Sailing</p>
        <p class="text-xs font-black text-blue-950 truncate">${depFriendly}</p>
        <p class="text-[10px] text-gray-500 font-medium truncate">to ${retFriendly}</p>
        <p class="text-sm font-black text-blue-900 mt-1">$${date.price} <span class="text-[9px] font-normal text-gray-400">PP</span></p>
      `;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".date-card-btn").forEach(b => {
          b.className = "date-card-btn shrink-0 border border-gray-200 hover:border-blue-900 rounded-xl p-3 text-left w-36 transition-all focus:outline-none";
        });
        btn.className = "date-card-btn shrink-0 border-2 border-blue-900 bg-blue-50/30 rounded-xl p-3 text-left w-36 transition-all focus:outline-none";
        selectedDateObj = deal.dates[idx];
        
        // Dynamically recalculating prices when date is changed
        recalculatePricesInModal();
      });

      datesCarousel.appendChild(btn);
    });

  } else {
    datesContainer.classList.add("hidden");
    datesCarousel.innerHTML = "";
  }

  const isPromoActive = discountConfig && discountConfig.isActive && discountConfig.percentage > 0;
  const globalBadgeItem = document.getElementById("global-discount-badge-item");
  const globalBadgePercent = document.getElementById("summary-discount-percent");
  
  if (isPromoActive) {
    globalBadgeItem.classList.remove("hidden");
    globalBadgePercent.innerText = discountConfig.percentage;
  } else {
    globalBadgeItem.classList.add("hidden");
  }

  // Clear Form Values
  document.getElementById("guest-name").value = "";
  document.getElementById("guest-country").value = "";
  document.getElementById("guest-email").value = "";
  document.getElementById("guest-phone").value = "";
  document.getElementById("guest-loyalty").value = "";

  formContainer.classList.remove("hidden");
  navControls.classList.remove("hidden");
  loadingState.classList.add("hidden");
  successState.classList.add("hidden");
  
  document.getElementById("mobile-sticky-footer").classList.remove("hidden");

  summaryBreakdown.classList.add("hidden");
  toggleSummaryBtn.innerText = "Show Summary ▾";

  setStep(1);

  // Trigger base pricing calculations on initialization
  recalculatePricesInModal();

  document.body.classList.add("overflow-hidden");
  modal.classList.remove("hidden");
}

// Master Recalculator: Resolves Cabin pricing relative to currently selected date's price
function recalculatePricesInModal() {
  if (!currentDealInModal) return;

  const guestCountSelect = document.getElementById("guest-count-select");
  const selectedRadio = document.querySelector('input[name="stateroom"]:checked');
  if (!selectedRadio) return;

  const stateroomType = selectedRadio.value;
  const guestCount = Number(guestCountSelect.value || 2);

  // Base Interior default rate
  let defaultInterior = currentDealInModal.interiorPrice || currentDealInModal.price || 1123;
  let defaultOutside = currentDealInModal.outsidePrice || 1363;
  let defaultBalcony = currentDealInModal.balconyPrice || 1335;
  let defaultSuite = currentDealInModal.suitePrice || 3185;

  // Compute database category offsets (deltas) relative to Interior base rate
  const deltaOutside = defaultOutside - defaultInterior;
  const deltaBalcony = defaultBalcony - defaultInterior;
  const deltaSuite = defaultSuite - defaultInterior;

  // Determine working base rates
  let workingInterior = defaultInterior;
  if (selectedDateObj) {
    // Selected dates price becomes base Interior rate
    workingInterior = selectedDateObj.price;
  }

  let workingOutside = workingInterior + deltaOutside;
  let workingBalcony = workingInterior + deltaBalcony;
  let workingSuite = workingInterior + deltaSuite;

  const isPromoActive = discountConfig && discountConfig.isActive && discountConfig.percentage > 0;
  
  // Render visual rates for radio button choices inside the selector panel
  const categories = [
    { id: "modal-interior-price", raw: workingInterior },
    { id: "modal-outside-price", raw: workingOutside },
    { id: "modal-balcony-price", raw: workingBalcony },
    { id: "modal-suite-price", raw: workingSuite }
  ];

  categories.forEach(cat => {
    const elem = document.getElementById(cat.id);
    if (isPromoActive) {
      const discountVal = Math.round(cat.raw * (1 - (discountConfig.percentage / 100)));
      elem.innerHTML = `<span class="line-through text-gray-400 font-normal mr-1">$${cat.raw}</span> $${discountVal}`;
    } else {
      elem.innerHTML = `$${cat.raw}`;
    }
  });

  // Calculate pricing based on stateroom chosen
  let baseCabinPrice = workingInterior;
  if (stateroomType === "Interior") baseCabinPrice = workingInterior;
  else if (stateroomType === "Outside View") baseCabinPrice = workingOutside;
  else if (stateroomType === "Balcony") baseCabinPrice = workingBalcony;
  else if (stateroomType === "Suite") baseCabinPrice = workingSuite;

  if (isPromoActive) {
    baseCabinPrice = Math.round(baseCabinPrice * (1 - (discountConfig.percentage / 100)));
  }

  const rawCruiseFare = baseCabinPrice * guestCount;

  // Compute promo discounts
  let promoSavings = 0;
  if (guestCount >= 2) {
    promoSavings += baseCabinPrice * 0.60;
  }
  if (guestCount > 2) {
    promoSavings += baseCabinPrice * (guestCount - 2);
  }

  const flatFlashVoucher = 150;
  const finalPromoSavings = promoSavings + flatFlashVoucher;
  const taxesAndFees = guestCount * 125;

  const estimatedTotal = rawCruiseFare - finalPromoSavings + taxesAndFees;
  const formattedTotal = `$${estimatedTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

  // Update Left Side Breakdown View
  document.getElementById("summary-guest-count").innerText = guestCount;
  document.getElementById("summary-base-fare").innerText = `$${rawCruiseFare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("summary-discounts").innerText = `-$${finalPromoSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById("summary-taxes").innerText = `$${taxesAndFees.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  document.getElementById("summary-estimated-total").innerText = formattedTotal;
  document.getElementById("summary-savings-total").innerText = `$${finalPromoSavings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  const affirmPayment = Math.ceil(estimatedTotal / 24);
  document.getElementById("summary-affirm-est").innerText = affirmPayment;

  document.getElementById("sticky-mobile-total").innerText = formattedTotal;
  document.getElementById("accordion-total-price").innerText = formattedTotal;
  document.getElementById("summary-success-final-price").innerText = formattedTotal;
}

function setupClaimListeners() {
  const modal = document.getElementById("promo-modal");
  const closeBtn = document.getElementById("close-modal-btn");
  const claimBtns = document.querySelectorAll(".claim-deal-btn");

  const modalScrollContainer = document.getElementById("modal-scroll-container");
  const formContainer = document.getElementById("express-form-container");
  const navControls = document.getElementById("modal-nav-controls");
  const loadingState = document.getElementById("booking-loading");
  const successState = document.getElementById("booking-success");

  const prevStepBtn = document.getElementById("prev-step-btn");
  const nextStepBtn = document.getElementById("next-step-btn");
  const mobileNextStepBtn = document.getElementById("mobile-next-step-btn");
  const successCloseBtn = document.getElementById("success-close-btn");

  const guestCountSelect = document.getElementById("guest-count-select");
  const stateroomRadios = document.querySelectorAll('input[name="stateroom"]');

  const toggleSummaryBtn = document.getElementById("toggle-summary-btn");
  const summaryBreakdown = document.getElementById("summary-breakdown-details");

  function updateStateroomSelectionBorders() {
    stateroomRadios.forEach(r => {
      const label = r.closest('label');
      if (r.checked) {
        label.className = "border-2 border-blue-900 rounded-xl overflow-hidden flex flex-col cursor-pointer transition-all relative bg-white pb-3 shadow-sm ring-2 ring-blue-900/10";
      } else {
        label.className = "border border-gray-200 rounded-xl overflow-hidden flex flex-col hover:border-blue-900 cursor-pointer transition-all relative bg-white pb-3 shadow-sm";
      }
    });
  }

  guestCountSelect.addEventListener("change", recalculatePricesInModal);
  stateroomRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      updateStateroomSelectionBorders();
      recalculatePricesInModal();
    });
  });

  if (toggleSummaryBtn && summaryBreakdown) {
    toggleSummaryBtn.addEventListener("click", () => {
      if (summaryBreakdown.classList.contains("hidden")) {
        summaryBreakdown.classList.remove("hidden");
        toggleSummaryBtn.innerText = "Hide Summary ▴";
      } else {
        summaryBreakdown.classList.add("hidden");
        toggleSummaryBtn.innerText = "Show Summary ▾";
      }
    });
  }

  claimBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const dealId = btn.getAttribute("data-id");
      const deal = allDeals.find(d => d.id === dealId);
      if (deal) openDealModal(deal);
    });
  });

  function validateGuestDetails() {
    const leadName = document.getElementById("guest-name").value.trim();
    const leadCountry = document.getElementById("guest-country").value.trim();
    const leadEmail = document.getElementById("guest-email").value.trim();
    const leadPhone = document.getElementById("guest-phone").value.trim();

    if (!leadName || !leadCountry || !leadEmail || !leadPhone) {
      alert("Please fill in all primary Lead Guest details before proceeding.");
      return false;
    }

    const names = document.querySelectorAll(".additional-guest-name");
    const ages = document.querySelectorAll(".additional-guest-age");

    for (let i = 0; i < names.length; i++) {
      if (!names[i].value.trim() || !ages[i].value.trim()) {
        alert(`Please complete the Name and Age details for Guest ${i+2}.`);
        return false;
      }
    }
    return true;
  }

  function handleNextStep() {
    if (currentStep === 1) {
      setStep(2);
    } else if (currentStep === 2) {
      if (validateGuestDetails()) {
        setStep(3);
      }
    } else if (currentStep === 3) {
      triggerHoldSubmission();
    }
  }

  nextStepBtn.addEventListener("click", handleNextStep);
  mobileNextStepBtn.addEventListener("click", handleNextStep);

  prevStepBtn.addEventListener("click", () => {
    if (currentStep > 1) {
      setStep(currentStep - 1);
    }
  });

  async function triggerHoldSubmission() {
    const nameVal = document.getElementById("guest-name").value.trim();
    const countryVal = document.getElementById("guest-country").value.trim();
    const emailVal = document.getElementById("guest-email").value.trim();
    const phoneVal = document.getElementById("guest-phone").value.trim();
    const loyaltyVal = document.getElementById("guest-loyalty").value.trim();

    formContainer.classList.add("hidden");
    navControls.classList.add("hidden");
    loadingState.classList.remove("hidden");
    document.getElementById("mobile-sticky-footer").classList.add("hidden");

    if (modalScrollContainer) {
      modalScrollContainer.scrollTop = 0;
    }

    try {
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const reservationId = `RPL-${randomDigits}`;

      const selectedRadio = document.querySelector('input[name="stateroom"]:checked');
      const stateroomType = selectedRadio ? selectedRadio.value : "Interior";
      const guestCount = Number(guestCountSelect.value || 2);

      // Resolve cabin base rates relative to active offsets
      let defaultInterior = currentDealInModal.interiorPrice || currentDealInModal.price || 1123;
      let defaultOutside = currentDealInModal.outsidePrice || 1363;
      let defaultBalcony = currentDealInModal.balconyPrice || 1335;
      let defaultSuite = currentDealInModal.suitePrice || 3185;

      const deltaOutside = defaultOutside - defaultInterior;
      const deltaBalcony = defaultBalcony - defaultInterior;
      const deltaSuite = defaultSuite - defaultInterior;

      let workingInterior = defaultInterior;
      if (selectedDateObj) {
        workingInterior = selectedDateObj.price;
      }

      let workingOutside = workingInterior + deltaOutside;
      let workingBalcony = workingInterior + deltaBalcony;
      let workingSuite = workingInterior + deltaSuite;

      let baseCabinPrice = workingInterior;
      if (stateroomType === "Interior") baseCabinPrice = workingInterior;
      else if (stateroomType === "Outside View") baseCabinPrice = workingOutside;
      else if (stateroomType === "Balcony") baseCabinPrice = workingBalcony;
      else if (stateroomType === "Suite") baseCabinPrice = workingSuite;

      const isPromoActive = discountConfig && discountConfig.isActive && discountConfig.percentage > 0;
      if (isPromoActive) {
        baseCabinPrice = Math.round(baseCabinPrice * (1 - (discountConfig.percentage / 100)));
      }

      const rawCruiseFare = baseCabinPrice * guestCount;

      let promoSavings = 0;
      if (guestCount >= 2) {
        promoSavings += baseCabinPrice * 0.60;
      }
      if (guestCount > 2) {
        promoSavings += baseCabinPrice * (guestCount - 2);
      }

      const flatFlashVoucher = 150;
      const finalPromoSavings = promoSavings + flatFlashVoucher;
      const taxesAndFees = guestCount * 125;
      const estimatedTotal = rawCruiseFare - finalPromoSavings + taxesAndFees;

      const now = new Date();
      const holdUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); 

      const companionsList = [];
      const companionNames = document.querySelectorAll(".additional-guest-name");
      const companionAges = document.querySelectorAll(".additional-guest-age");
      for (let i = 0; i < companionNames.length; i++) {
        companionsList.push({
          name: companionNames[i].value.trim(),
          age: Number(companionAges[i].value.trim())
        });
      }

      // Record selection departure rate parameters directly
      let chosenDepartureDateString = currentDealInModal.departureDate || "Selected Date";
      if (selectedDateObj) {
        chosenDepartureDateString = `${formatDateFriendly(selectedDateObj.departure)} - ${formatDateFriendly(selectedDateObj.return)}`;
      }

      const reservationDocRef = doc(db, "reservations", reservationId);
      await setDoc(reservationDocRef, {
        reservationId: reservationId,
        createdAt: now.toISOString(),
        holdUntil: holdUntil.toISOString(),
        status: "hold",
        leadGuest: {
          name: nameVal,
          country: countryVal,
          email: emailVal,
          phone: phoneVal,
          loyaltyNumber: loyaltyVal || null
        },
        additionalGuests: companionsList,
        bookingDetails: {
          cruiseTitle: currentDealInModal.title,
          shipName: currentDealInModal.ship,
          departureDate: chosenDepartureDateString,
          stateroomType: stateroomType,
          guestCount: guestCount
        },
        pricing: {
          baseFare: rawCruiseFare,
          discountsApplied: finalPromoSavings,
          taxesAndFees: taxesAndFees,
          estimatedTotal: estimatedTotal
        }
      });

      loadingState.classList.add("hidden");
      successState.classList.remove("hidden");

      if (modalScrollContainer) {
        modalScrollContainer.scrollTop = 0;
      }

      document.getElementById("summary-room-type").innerText = stateroomType + " Option";
      document.getElementById("summary-name").innerText = nameVal;
      document.getElementById("summary-hold-code").innerText = reservationId;

    } catch (error) {
      console.error("Error saving reservation to database:", error);
      alert("An error occurred while securing your hold reservation. Please try again.");
      
      loadingState.classList.add("hidden");
      formContainer.classList.remove("hidden");
      navControls.classList.remove("hidden");
      document.getElementById("mobile-sticky-footer").classList.remove("hidden");
    }
  }

  function resetAndCloseModal() {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");

    document.body.classList.remove("modal-active");
    const liveActivity = document.getElementById("live-activity-container");
    if (liveActivity) {
      liveActivity.classList.remove("hidden");
    }

    currentDealInModal = null;
    currentStep = 1;
    selectedDateObj = null;
  }

  successCloseBtn.addEventListener("click", resetAndCloseModal);
  closeBtn.addEventListener("click", resetAndCloseModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      resetAndCloseModal();
    }
  });
}

function setupShareListeners() {
  const shareBtns = document.querySelectorAll(".share-deal-btn");
  shareBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dealId = btn.getAttribute("data-id");
      const shareUrl = `${window.location.origin}${window.location.pathname}?deal=${dealId}`;
      
      navigator.clipboard.writeText(shareUrl).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
          <svg class="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        `;
        btn.classList.remove("text-gray-300");
        btn.classList.add("text-emerald-600");
        
        showShareNotificationToast();

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove("text-emerald-600");
          btn.classList.add("text-gray-300");
        }, 2000);
      }).catch(err => {
        console.error("Failed to copy link to user clipboard:", err);
      });
    });
  });
}

function showShareNotificationToast() {
  let toast = document.getElementById("share-success-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "share-success-toast";
    toast.className = "fixed top-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl z-50 opacity-0 transition-opacity duration-300 pointer-events-none";
    toast.innerText = "Direct link copied to clipboard! Share with family or friends.";
    document.body.appendChild(toast);
  }
  toast.classList.remove("opacity-0");
  setTimeout(() => {
    toast.classList.add("opacity-0");
  }, 2500);
}

function checkDeepLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const dealId = urlParams.get("deal");
  if (!dealId) return;

  const targetDeal = allDeals.find(d => d.id === dealId);
  if (targetDeal) {
    openDealModal(targetDeal);
  }
}

function startUrgencyCountdown() {
  const countdownElem = document.getElementById("announcement-countdown");
  if (!countdownElem) return;

  function updateTimer() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    const diff = midnight - now;
    if (diff <= 0) {
      midnight.setHours(24, 0, 0, 0);
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (num) => String(num).padStart(2, "0");
    countdownElem.innerText = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

function startLiveActivityFeed() {
  const container = document.getElementById("live-activity-container");
  if (!container) return;

  const names = ["Marcus A.", "David K.", "Jessica T.", "James L.", "Emily B.", "Michael R.", "Sophia G.", "Robert P.", "Olivia W.", "William H."];
  const actions = ["just locked in a price on", "placed a 24hr price hold on", "selected a suite balcony deal on", "guaranteed starting rates on"];
  
  function showNotification() {
    if (allDeals.length === 0) return;
    
    const name = names[Math.floor(Math.random() * names.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const randomDeal = allDeals[Math.floor(Math.random() * allDeals.length)];
    const timeAgo = Math.floor(Math.random() * 8) + 1;

    const toast = document.createElement("div");
    toast.className = "bg-white border border-gray-100 rounded-xl shadow-xl p-4 flex items-center space-x-3 pointer-events-auto transform scale-95 opacity-0 transition-all duration-300 ease-out max-w-xs md:max-w-sm w-full";
    toast.innerHTML = `
      <div class="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-900 shrink-0">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <div class="flex-grow min-w-0">
        <p class="text-xs text-gray-700 leading-tight">
          <span class="font-extrabold text-blue-950">${name}</span> ${action} 
          <span class="font-bold text-pink-600">${randomDeal.ship}</span>
        </p>
        <p class="text-[10px] text-gray-400 font-medium mt-0.5">${timeAgo}m ago • Verified</p>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("scale-95", "opacity-0");
      toast.classList.add("scale-100", "opacity-100");
    }, 100);

    setTimeout(() => {
      toast.classList.remove("scale-100", "opacity-100");
      toast.classList.add("scale-95", "opacity-0");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 6000);
  }

  setTimeout(() => {
    showNotification();
    setInterval(showNotification, 28000);
  }, 8000);
}

setupInteractiveListeners();
setupMobileMenu();
initializePromoFinder();

function setupMobileMenu() {
  const toggleBtn = document.getElementById("menu-toggle-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (!toggleBtn || !mobileMenu) return;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mobileMenu.classList.toggle("hidden");
  });

  const mobileLinks = mobileMenu.querySelectorAll("a");
  mobileLinks.forEach(link => {
    link.addEventListener("click", () => {
      mobileMenu.classList.add("hidden");
    });
  });

  document.addEventListener("click", (e) => {
    if (!mobileMenu.classList.contains("hidden") && !mobileMenu.contains(e.target) && e.target !== toggleBtn) {
      mobileMenu.classList.add("hidden");
    }
  });
}