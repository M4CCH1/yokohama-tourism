const map = L.map('map').setView(
    [35.4508, 139.6316],
    13
);

L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '&copy; OpenStreetMap contributors'
    }
).addTo(map);


// コースに追加したスポット
let courseSpots = [];

//ルート表示用
let routeLine = null;
let routeSegments = [];

// 2地点間の距離を計算する
function calculateDistance(lat1, lon1, lat2, lon2) {

    const R = 6371; // 地球の半径(km)

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return R * c;
}



// 最短コースを作成する
async function createShortestCourse() {

    // 開始地点の確認
    if (!startPoint) {
        alert('開始地点が取得できていません');
        return;
    }

    // 観光スポットの確認
    if (courseSpots.length < 2) {
        alert('2か所以上の観光スポットを追加してください');
        return;
    }


    // 処理中表示
    const button =
        document.querySelector('#shortest-course-button');

    if (button) {
        button.disabled = true;
        button.textContent = '最短コースを計算中...';
    }


    try {

        // =====================================
        // ① 開始地点 + 観光スポットの一覧を作る
        // =====================================

        const points = [
            startPoint,
            ...courseSpots
        ];


        // =====================================
        // ② OSRMから全地点間の道路距離を取得
        // =====================================

        const distanceMatrix =
            await getDistanceMatrix(points);


        // =====================================
        // ③ 全候補を比較
        // =====================================

        const spotIndexes =
            courseSpots.map((spot, index) => index + 1);


        const permutations =
            generatePermutations(spotIndexes);


        let bestOrder = null;
        let bestDistance = Infinity;


        // 全パターンを調べる
        for (const order of permutations) {

            // 開始地点(0)からスタート
            const fullOrder = [
                0,
                ...order
            ];


            let totalDistance = 0;


            // 各区間の距離を合計
            for (let i = 0; i < fullOrder.length - 1; i++) {

                const from =
                    fullOrder[i];

                const to =
                    fullOrder[i + 1];


                const distance =
                    distanceMatrix[from][to];


                // 道路が存在しない場合
                if (distance === null) {
                    totalDistance = Infinity;
                    break;
                }


                totalDistance += distance;
            }


            // より短いルートなら更新
            if (totalDistance < bestDistance) {

                bestDistance = totalDistance;

                bestOrder = order;
            }
        }


        // =====================================
        // ④ 最短順に並び替える
        // =====================================

        if (!bestOrder) {

            alert(
                'すべてのスポットをつなぐ道路ルートが見つかりませんでした'
            );

            return;
        }


        courseSpots = bestOrder.map(index =>
            courseSpots[index - 1]
        );


        // 各区間の距離・時間を取得
        await calculateRouteSegments();


        // コース一覧を表示
        displayRouteResult();

        // ルートタブへ切替
        showRouteTab();

        // 地図上に道路ルートを表示
        await displayRoute();


    } catch (error) {

        console.error(
            '最短コース計算エラー:',
            error
        );

        alert(
            '最短コースの計算に失敗しました'
        );

    } finally {

        // ボタンを元に戻す
        if (button) {
            button.disabled = false;
            button.textContent = '最短コースを作成';
        }
    }
}


// 観光スポット取得
fetch('/spots')
    .then(response => response.json())
    .then(spots => {

        spots.forEach(spot => {

            const popup = `
                <div class="spot-popup">

                    <img
                        src="${spot.image_url}"
                        alt="${spot.name}"
                        class="spot-image"
                    >

                    <h3>${spot.name}</h3>

                    <p>
                        カテゴリ: ${spot.category}<br>
                        滞在時間: ${spot.stay_minutes}分
                    </p>

                    <button onclick="addToCourse(
                        ${spot.id},
                        '${spot.name}',
                        ${spot.stay_minutes},
                        ${spot.latitude},
                        ${spot.longitude}
                    )">
                        コースに追加
                    </button>

                </div>
            `;

            L.marker([
                spot.latitude,
                spot.longitude
            ])
            .addTo(map)
            .bindPopup(popup);

        });

    });


// 開始地点
let startPoint = null;
let startPoints = [];
let startMarker = null;


// 開始地点取得
fetch('/start-points')
    .then(response => response.json())
    .then(points => {

        startPoints = points;

        const select =
            document.getElementById('start-point-select');

        points.forEach(point => {

            const option =
                document.createElement('option');

            option.value = point.id;
            option.textContent = point.name;

            select.appendChild(option);

        });


        // 最初の開始地点を初期値にする
        if (points.length > 0) {

            startPoint = points[0];

            select.value = startPoint.id;

            displayStartPointMarker();
        }

    });

function displayStartPointMarker() {

    // 古い開始地点マーカーを削除
    if (startMarker) {
        map.removeLayer(startMarker);
    }


    // 新しい開始地点マーカー
    startMarker = L.marker(
        [
            startPoint.latitude,
            startPoint.longitude
        ],
        {
            icon: L.divIcon({
                className: 'start-marker',
                iconSize: [20, 20]
            })
        }
    )
    .addTo(map)
    .bindPopup(`
        <b>開始地点</b><br>
        ${startPoint.name}
    `);


    // 新しい開始地点を地図の中心にする
    map.setView(
        [
            startPoint.latitude,
            startPoint.longitude
        ],
        13
    );
}


// コースにスポットを追加
function addToCourse(id, name, stayMinutes, latitude, longitude) {

    const exists = courseSpots.some(
        spot => spot.id === id
    );

    if (exists) {
        alert('このスポットはすでに追加されています');
        return;
    }

    courseSpots.push({
        id: id,
        name: name,
        stay_minutes: stayMinutes,
        latitude: latitude,
        longitude: longitude
    });

    displaySpotList();
}


function displaySpotList()
{
    const courseList =
        document.getElementById('course-list');

    courseList.innerHTML = '';

    if (courseSpots.length === 0)
    {
        courseList.innerHTML =
            '<p>まだスポットが追加されていません。</p>';

        return;
    }

    courseSpots.forEach((spot, index) =>
    {
        const item =
            document.createElement('div');

        item.className = 'course-spot';

        item.innerHTML = `
            <b>${index + 1}. ${spot.name}</b>

            <span>
                （${spot.stay_minutes}分）
            </span>

            <button
                onclick="removeFromCourse(${spot.id})">
                削除
            </button>
        `;

        courseList.appendChild(item);
    });
}


function displayRouteResult()
{
    const routeInfo =
        document.getElementById('route-info');

    routeInfo.innerHTML = '';

    if (!startPoint)
    {
        return;
    }

    let html = `
        <div class="route-start">
            <b>開始地点：</b>
            ${startPoint.name}
        </div>
    `;

    let totalStayMinutes = 0;
    let totalDistance = 0;
    let totalTravelSeconds = 0;

    courseSpots.forEach((spot, index) =>
    {
        totalStayMinutes += spot.stay_minutes;

        const segment =
            routeSegments[index];

        if (segment)
        {
            const distanceKm =
                (segment.distance / 1000).toFixed(2);

            const durationMinutes =
                Math.round(
                    segment.duration / 60
                );

            totalDistance +=
                segment.distance;

            totalTravelSeconds +=
                segment.duration;

            html += `
                <div class="route-segment">
                    ↓ ${distanceKm}km
                    / 約${durationMinutes}分
                </div>
            `;
        }

        html += `
            <div class="course-spot">
                <b>
                    ${index + 1}.
                    ${spot.name}
                </b>
            </div>
        `;
    });

    const totalDistanceKm =
        (totalDistance / 1000).toFixed(2);

    const totalTravelMinutes =
        Math.round(
            totalTravelSeconds / 60
        );

    html += `
        <hr>

        <p>
            <b>移動距離：</b>
            ${totalDistanceKm} km
        </p>

        <p>
            <b>移動時間：</b>
            約${totalTravelMinutes}分
        </p>

        <p>
            <b>滞在時間：</b>
            ${totalStayMinutes}分
        </p>

        <p>
            <b>総所要時間：</b>
            約${totalTravelMinutes + totalStayMinutes}分
        </p>
    `;

    routeInfo.innerHTML = html;
}


// コースから削除
async function removeFromCourse(id) {

    courseSpots = courseSpots.filter(
        spot => spot.id !== id
    );


    // スポットが残っている場合
    if (courseSpots.length > 0) {

        await calculateRouteSegments();

    } else {

        routeSegments = [];

    }


    displaySpotList();
    displayRouteResult();

    await displayRoute();
}


document
    .getElementById('start-point-select')
    .addEventListener('change', function () {

        const selectedId = Number(this.value);

        startPoint = startPoints.find(
            point => point.id === selectedId
        );

        if (!startPoint) {
            return;
        }

        displayStartPointMarker();

        // 開始地点が変わったので
        // 現在のコースをリセット
        courseSpots = [];
        routeSegments = [];

        displaySpotList();
        displayRouteResult();

        displayRoute();

    });

async function displayRoute() {

    // 古いルートを削除
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    // 開始地点がない場合
    if (!startPoint) {
        return;
    }

    // 観光スポットがない場合
    if (courseSpots.length === 0) {
        return;
    }


    // =========================
    // ルート検索用の座標を作成
    // =========================

    const routePoints = [
        startPoint,
        ...courseSpots
    ];


    // OSRM用の座標形式
    // longitude,latitude
    const coordinates = routePoints
        .map(point =>
            `${point.longitude},${point.latitude}`
        )
        .join(';');


    // =========================
    // OSRM API
    // =========================

    const url =
        `https://router.project-osrm.org/route/v1/foot/` +
        `${coordinates}` +
        `?overview=full&geometries=geojson`;


    try {

        const response = await fetch(url);

        const data = await response.json();


        // ルート取得失敗
        if (data.code !== 'Ok') {

            console.error('ルート取得失敗:', data);

            alert('ルートを取得できませんでした');

            return;
        }


        // =========================
        // OSRMからルート情報取得
        // =========================

        const route = data.routes[0];


        // 距離（m）
        const distance = route.distance;


        // 所要時間（秒）
        const duration = route.duration;


        // =========================
        // GeoJSONの座標をLeaflet形式へ変換
        // =========================

        const latlngs =
            route.geometry.coordinates.map(
                coordinate => [
                    coordinate[1],
                    coordinate[0]
                ]
            );


        // =========================
        // 地図にルート表示
        // =========================

        routeLine = L.polyline(
            latlngs,
            {
                weight: 5
            }
        ).addTo(map);


        // ルート全体を表示
        map.fitBounds(
            routeLine.getBounds()
        );


    } catch (error) {

        console.error(
            'ルート取得エラー:',
            error
        );

        alert('ルート取得中にエラーが発生しました');

    }
}




async function getRoadDistance(point1, point2) {

    const coordinates =
        `${point1.longitude},${point1.latitude};` +
        `${point2.longitude},${point2.latitude}`;


    const url =
        `https://router.project-osrm.org/route/v1/foot/` +
        `${coordinates}` +
        `?overview=false`;


    try {

        const response = await fetch(url);

        const data = await response.json();


        if (data.code !== 'Ok') {

            console.error(
                '道路距離取得失敗:',
                data
            );

            return Infinity;
        }


        // メートル単位
        return data.routes[0].distance;

    } catch (error) {

        console.error(
            'OSRM通信エラー:',
            error
        );

        return Infinity;
    }
}



async function getDistanceMatrix(points) {

    // OSRM用の座標
    const coordinates =
        points
            .map(point =>
                `${point.longitude},${point.latitude}`
            )
            .join(';');


    const url =
        `https://router.project-osrm.org/table/v1/foot/` +
        `${coordinates}` +
        `?annotations=distance`;


    const response =
        await fetch(url);


    if (!response.ok) {
        throw new Error(
            'OSRM Table APIへのアクセスに失敗しました'
        );
    }


    const data =
        await response.json();


    if (data.code !== 'Ok') {
        throw new Error(
            `OSRMエラー: ${data.code}`
        );
    }


    return data.distances;
}



function generatePermutations(array) {

    if (array.length === 1) {
        return [array];
    }


    const result = [];


    for (let i = 0; i < array.length; i++) {

        const current = array[i];


        const remaining =
            array.slice(0, i)
                 .concat(array.slice(i + 1));


        const permutations =
            generatePermutations(remaining);


        for (const permutation of permutations) {

            result.push([
                current,
                ...permutation
            ]);

        }
    }


    return result;
}


async function getRouteSegment(point1, point2) {

    const coordinates =
        `${point1.longitude},${point1.latitude};` +
        `${point2.longitude},${point2.latitude}`;

    const url =
        `https://router.project-osrm.org/route/v1/foot/` +
        `${coordinates}` +
        `?overview=false`;


    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            'OSRM Route APIへのアクセスに失敗しました'
        );
    }


    const data = await response.json();


    if (data.code !== 'Ok') {
        throw new Error(
            `OSRMエラー: ${data.code}`
        );
    }


    const route = data.routes[0];


    return {
        distance: route.distance,
        duration: route.duration
    };
}


async function calculateRouteSegments() {

    routeSegments = [];


    // 開始地点
    let previousPoint = startPoint;


    for (let i = 0; i < courseSpots.length; i++) {

        const currentSpot = courseSpots[i];


        // 前の地点 → 現在のスポット
        const segment =
            await getRouteSegment(
                previousPoint,
                currentSpot
            );


        routeSegments.push({
            from: previousPoint.name,
            to: currentSpot.name,
            distance: segment.distance,
            duration: segment.duration
        });


        // 現在地点を更新
        previousPoint = currentSpot;
    }
}


// ======================
// Bottom Sheet
// ======================
const sheet = document.getElementById("course");
const handle = document.querySelector(".sheet-handle");

const NAV_HEIGHT = 65;

function getPositions() {
    return [
        window.innerHeight * 0.65 - NAV_HEIGHT, // small
        window.innerHeight * 0.40,              // medium
        window.innerHeight * 0.25               // large

    ];

}

let POSITIONS = getPositions();

let currentState = 1;

let startY = 0;
let startTranslate = POSITIONS[1];
let currentTranslate = POSITIONS[1];

let dragging = false;


function setSheetPosition(position) {
    currentTranslate = position;

    sheet.style.transform =
        `translate3d(0, ${position}px, 0)`;
}


function snapToNearest()
{
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    POSITIONS.forEach((pos, index) =>
    {
        const distance =
            Math.abs(currentTranslate - pos);

        if (distance < nearestDistance)
        {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    currentState = nearestIndex;

    sheet.classList.remove("dragging");

    setSheetPosition(POSITIONS[nearestIndex]);
}



function setSheetPosition(position) {
    currentTranslate = position;

    sheet.style.transform =
        `translate3d(0, ${position}px, 0)`;
}


// シートをタップしたら次の位置へ
sheet.addEventListener("click", function(e) {

    // ボタンやセレクトボックスをタップした場合は
    // シートの開閉処理を実行しない
    if (
        e.target.closest("button") ||
        e.target.closest("select") ||
        e.target.closest("input")
    ) {
        return;
    }

    currentState++;

    if (currentState >= POSITIONS.length) {
        currentState = 0;
    }

    setSheetPosition(POSITIONS[currentState]);
});


// 画面サイズが変わった場合
window.addEventListener("resize", function() {

    POSITIONS = getPositions();

    setSheetPosition(POSITIONS[currentState]);
});


// 初期位置
setSheetPosition(POSITIONS[currentState]);


function snapToNearest() {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    POSITIONS.forEach((position, index) => {
        const distance =
            Math.abs(currentTranslate - position);

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    currentState = nearestIndex;

    sheet.classList.remove("dragging");

    setSheetPosition(POSITIONS[currentState]);
}


setSheetPosition(POSITIONS[currentState]);

// ======================
// 下部ナビゲーション
// ======================

function showMap() {

    const course =
        document.getElementById('course');

    course.classList.remove(
        'state-small',
        'state-medium',
        'state-large'
    );

    course.classList.add('state-small');

    updateNavigation('map');

    setTimeout(() => {
        map.invalidateSize();
    }, 300);
}

function showCourse() {

    const course =
        document.getElementById('course');

    course.classList.remove(
        'state-small',
        'state-medium',
        'state-large'
    );

    course.classList.add('state-large');

    updateNavigation('course');

    setTimeout(() => {
        map.invalidateSize();
    }, 300);
}

function updateNavigation(active) {

const navItems =
    document.querySelectorAll('.nav-item');

navItems.forEach(item => {
    item.classList.remove('active');
});

if (active === 'map') {
    navItems[0].classList.add('active');
}

if (active === 'course') {
    navItems[1].classList.add('active');
}

}


function showListTab()
{
    document.getElementById("list-view").style.display = "block";
    document.getElementById("route-view").style.display = "none";

    document.getElementById("list-tab")
        .classList.add("active");

    document.getElementById("route-tab")
        .classList.remove("active");
}

function showRouteTab()
{
    document.getElementById("list-view").style.display = "none";
    document.getElementById("route-view").style.display = "block";

    document.getElementById("route-tab")
        .classList.add("active");

    document.getElementById("list-tab")
        .classList.remove("active");
}


displaySpotList();
showListTab();