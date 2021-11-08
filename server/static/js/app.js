
/**
 * Hello, dear curious visitor. I am not a web-guy, so please don't judge my horrible JS code.
 * In fact, please do tell me about all the things I did wrong and that I could improve. I've been trying
 * to read up on modern JS, but it's just a little much.
 *
 * Feel free to open tickets at https://github.com/binwiederhier/ntfy/issues. Thank you!
 */

/* All the things */

let topics = {};
let currentTopic = "";
let currentTopicUnsubscribeOnClose = false;

/* Main view */
const main = document.getElementById("main");
const topicsHeader = document.getElementById("topicsHeader");
const topicsList = document.getElementById("topicsList");
const topicField = document.getElementById("topicField");
const notifySound = document.getElementById("notifySound");
const subscribeButton = document.getElementById("subscribeButton");
const errorField = document.getElementById("error");
const originalTitle = document.title;

/* Detail view */
const detailView = document.getElementById("detail");
const detailTitle = document.getElementById("detailTitle");
const detailEventsList = document.getElementById("detailEventsList");
const detailTopicUrl = document.getElementById("detailTopicUrl");
const detailNoNotifications = document.getElementById("detailNoNotifications");
const detailCloseButton = document.getElementById("detailCloseButton");
const detailNotificationsDisallowed = document.getElementById("detailNotificationsDisallowed");

const subscribe = (topic) => {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
                subscribeInternal(topic, true, 0);
            } else {
                showNotificationDeniedError();
            }
        });
    } else {
        subscribeInternal(topic, true,0);
    }
};

const subscribeInternal = (topic, persist, delaySec) => {
    setTimeout(() => {
        // Render list entry
        let topicEntry = document.getElementById(`topic-${topic}`);
        if (!topicEntry) {
            topicEntry = document.createElement('li');
            topicEntry.id = `topic-${topic}`;
            topicEntry.innerHTML = `<a href="/${topic}" onclick="return showDetail('${topic}')">${topic}</a> <button onclick="test('${topic}'); return false;"> <img src="static/img/send_black_24dp.svg"> Test</button> <button onclick="unsubscribe('${topic}'); return false;"> <img src="static/img/clear_black_24dp.svg"> Unsubscribe</button>`;
            topicsList.appendChild(topicEntry);
        }
        topicsHeader.style.display = '';

        // Open event source
        let eventSource = new EventSource(`${topic}/sse`);
        eventSource.onopen = () => {
            topicEntry.innerHTML = `<a href="/${topic}" onclick="return showDetail('${topic}')">${topic}</a> <button onclick="test('${topic}'); return false;"> <img src="static/img/send_black_24dp.svg"> Test</button> <button onclick="unsubscribe('${topic}'); return false;"> <img src="static/img/clear_black_24dp.svg"> Unsubscribe</button>`;
            delaySec = 0; // Reset on successful connection
        };
        eventSource.onerror = (e) => {
            topicEntry.innerHTML = `<a href="/${topic}" onclick="return showDetail('${topic}')">${topic}</a> <i>(Reconnecting)</i> <button disabled="disabled">Test</button> <button onclick="unsubscribe('${topic}'); return false;">Unsubscribe</button>`;
            eventSource.close();
            const newDelaySec = (delaySec + 5 <= 15) ? delaySec + 5 : 15;
            subscribeInternal(topic, persist, newDelaySec);
        };
        eventSource.onmessage = (e) => {
            const event = JSON.parse(e.data);
            topics[topic]['messages'].push(event);
            topics[topic]['messages'].sort((a, b) => { return a.time < b.time; }) // Newest first
            if (currentTopic === topic) {
                rerenderDetailView();
            }
            if (Notification.permission === "granted") {
                notifySound.play();
                new Notification(`${location.host}/${topic}`, {
                    body: event.message,
                    icon: '/static/img/favicon.png'
                });
            }
        };
        topics[topic] = {
            'eventSource': eventSource,
            'messages': [],
            'persist': persist
        };
        fetchCachedMessages(topic).then(() => {
            if (currentTopic === topic) {
                rerenderDetailView();
            }
        })
        let persistedTopicKeys = Object.keys(topics).filter(t => topics[t].persist);
        localStorage.setItem('topics', JSON.stringify(persistedTopicKeys));
    }, delaySec * 1000);
};

const unsubscribe = (topic) => {
    topics[topic]['eventSource'].close();
    delete topics[topic];
    localStorage.setItem('topics', JSON.stringify(Object.keys(topics)));
    document.getElementById(`topic-${topic}`).remove();
    if (Object.keys(topics).length === 0) {
        topicsHeader.style.display = 'none';
    }
};

const test = (topic) => {
    fetch(`/${topic}`, {
        method: 'PUT',
        body: `This is a test notification sent by the ntfy.sh Web UI at ${new Date().toString()}.`
    });
};

const fetchCachedMessages = async (topic) => {
    const topicJsonUrl = `/${topic}/json?poll=1`; // Poll!
    for await (let line of makeTextFileLineIterator(topicJsonUrl)) {
        const message = JSON.parse(line);
        topics[topic]['messages'].push(message);
    }
    topics[topic]['messages'].sort((a, b) => { return a.time < b.time; }) // Newest first
};

const showDetail = (topic) => {
    currentTopic = topic;
    history.replaceState(topic, `ntfy.sh/${topic}`, `/${topic}`);
    window.scrollTo(0, 0);
    rerenderDetailView();
    return false;
};

const rerenderDetailView = () => {
    detailTitle.innerHTML = `ntfy.sh/${currentTopic}`; // document.location.replaceAll(..)
    detailTopicUrl.innerHTML = `ntfy.sh/${currentTopic}`;
    while (detailEventsList.firstChild) {
        detailEventsList.removeChild(detailEventsList.firstChild);
    }
    topics[currentTopic]['messages'].forEach(m => {
        let dateDiv = document.createElement('div');
        let messageDiv = document.createElement('div');
        let eventDiv = document.createElement('div');
        dateDiv.classList.add('detailDate');
        dateDiv.innerHTML = new Date(m.time * 1000).toLocaleString();
        messageDiv.classList.add('detailMessage');
        messageDiv.innerText = m.message;
        eventDiv.appendChild(dateDiv);
        eventDiv.appendChild(messageDiv);
        detailEventsList.appendChild(eventDiv);
    })
    if (topics[currentTopic]['messages'].length === 0) {
        detailNoNotifications.style.display = '';
    } else {
        detailNoNotifications.style.display = 'none';
    }
    if (Notification.permission === "granted") {
        detailNotificationsDisallowed.style.display = 'none';
    } else {
        detailNotificationsDisallowed.style.display = 'block';
    }
    detailView.style.display = 'block';
    main.style.display = 'none';
};

const hideDetailView = () => {
    if (currentTopicUnsubscribeOnClose) {
        unsubscribe(currentTopic);
        currentTopicUnsubscribeOnClose = false;
    }
    currentTopic = "";
    history.replaceState('', originalTitle, '/');
    detailView.style.display = 'none';
    main.style.display = '';
    return false;
};

const requestPermission = () => {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
                detailNotificationsDisallowed.style.display = 'none';
            }
        });
    }
    return false;
};

const showError = (msg) => {
    errorField.innerHTML = msg;
    topicField.disabled = true;
    subscribeButton.disabled = true;
};

const showBrowserIncompatibleError = () => {
    showError("Your browser is not compatible to use the web-based desktop notifications.");
};

const showNotificationDeniedError = () => {
    showError("You have blocked desktop notifications for this website. Please unblock them and refresh to use the web-based desktop notifications.");
};

// From: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
async function* makeTextFileLineIterator(fileURL) {
    const utf8Decoder = new TextDecoder('utf-8');
    const response = await fetch(fileURL);
    const reader = response.body.getReader();
    let { value: chunk, done: readerDone } = await reader.read();
    chunk = chunk ? utf8Decoder.decode(chunk) : '';

    const re = /\n|\r|\r\n/gm;
    let startIndex = 0;
    let result;

    for (;;) {
        let result = re.exec(chunk);
        if (!result) {
            if (readerDone) {
                break;
            }
            let remainder = chunk.substr(startIndex);
            ({ value: chunk, done: readerDone } = await reader.read());
            chunk = remainder + (chunk ? utf8Decoder.decode(chunk) : '');
            startIndex = re.lastIndex = 0;
            continue;
        }
        yield chunk.substring(startIndex, result.index);
        startIndex = re.lastIndex;
    }
    if (startIndex < chunk.length) {
        yield chunk.substr(startIndex); // last line didn't end in a newline char
    }
}

subscribeButton.onclick = () => {
    if (!topicField.value) {
        return false;
    }
    subscribe(topicField.value);
    topicField.value = "";
    return false;
};

detailCloseButton.onclick = () => {
    hideDetailView();
};

// Disable Web UI if notifications of EventSource are not available
if (!window["Notification"] || !window["EventSource"]) {
    showBrowserIncompatibleError();
} else if (Notification.permission === "denied") {
    showNotificationDeniedError();
}

// Reset UI
topicField.value = "";

// (Temporarily) subscribe topic if we navigated to /sometopic URL
const match = location.pathname.match(/^\/([-_a-zA-Z0-9]{1,64})$/) // Regex must match Go & Android app!
if (match) {
    currentTopic = match[1];
    subscribeInternal(currentTopic, false,0);
}

// Restore topics
const storedTopics = localStorage.getItem('topics');
if (storedTopics) {
    const storedTopicsArray = JSON.parse(storedTopics);
    storedTopicsArray.forEach((topic) => { subscribeInternal(topic, true, 0); });
    if (storedTopicsArray.length === 0) {
        topicsHeader.style.display = 'none';
    }
    if (currentTopic) {
        currentTopicUnsubscribeOnClose = !storedTopicsArray.includes(currentTopic);
    }
} else {
    topicsHeader.style.display = 'none';
    if (currentTopic) {
        currentTopicUnsubscribeOnClose = true;
    }
}
