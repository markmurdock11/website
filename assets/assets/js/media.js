// assets/assets/js/media.js

// --- helpers ---
function imdbTitleLink(title) {
  // simple IMDB search link so you don't have to maintain specific IDs
  const q = encodeURIComponent(title);
  return `https://www.imdb.com/find/?q=${q}&s=tt`;
}

function wikiLink(title) {
  // simple wikipedia link (good enough for books)
  const slug = title.trim().replace(/\s+/g, "_");
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
}

function spotifySearchLink(query) {
  const q = encodeURIComponent(query);
  return `https://open.spotify.com/search/${q}`;
}

function normalizeItem(item) {
  return {
    title: item.title.trim(),
    url: item.url.trim(),
    kind: item.kind || "link"
  };
}

function sortByTitleAZ(items) {
  return [...items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

// --- top 10 lists (your picks) ---
const lists = {
  movies: [
    { title: "The Prestige", url: imdbTitleLink("The Prestige"), kind: "movie" },
    { title: "Magnolia", url: imdbTitleLink("Magnolia"), kind: "movie" },
    { title: "The Network", url: imdbTitleLink("Network 1976"), kind: "movie" },
    { title: "Eyes Wide Shut", url: imdbTitleLink("Eyes Wide Shut"), kind: "movie" },
    { title: "Pulp Fiction", url: imdbTitleLink("Pulp Fiction"), kind: "movie" },
    { title: "The Dark Knight Rises", url: imdbTitleLink("The Dark Knight Rises"), kind: "movie" },
    { title: "Good Will Hunting", url: imdbTitleLink("Good Will Hunting"), kind: "movie" },
    { title: "Dumb and Dumber", url: imdbTitleLink("Dumb and Dumber"), kind: "movie" },
    { title: "Hacksaw Ridge", url: imdbTitleLink("Hacksaw Ridge"), kind: "movie" },
    { title: "Margin Call", url: imdbTitleLink("Margin Call"), kind: "movie" }
  ],

  tv: [
    { title: "Avatar: The Last Airbender", url: imdbTitleLink("Avatar The Last Airbender"), kind: "tv" },
    { title: "Silicon Valley", url: imdbTitleLink("Silicon Valley"), kind: "tv" },
    { title: "Succession", url: imdbTitleLink("Succession"), kind: "tv" },
    { title: "The Office", url: imdbTitleLink("The Office US"), kind: "tv" },
    { title: "The Sandman", url: imdbTitleLink("The Sandman"), kind: "tv" },
    { title: "Entourage", url: imdbTitleLink("Entourage"), kind: "tv" },
    { title: "Psych", url: imdbTitleLink("Psych"), kind: "tv" },
    { title: "How I Met Your Mother", url: imdbTitleLink("How I Met Your Mother"), kind: "tv" },
    { title: "The Beast in Me", url: imdbTitleLink("The Beast in Me"), kind: "tv" },
    { title: "Community", url: imdbTitleLink("Community"), kind: "tv" }
  ],

  books: [
    { title: "The Hobbit", url: wikiLink("The Hobbit"), kind: "book" },
    { title: "The Fountainhead", url: wikiLink("The Fountainhead"), kind: "book" },
    { title: "Amusing Ourselves to Death", url: wikiLink("Amusing Ourselves to Death"), kind: "book" },
    { title: "Quiet", url: wikiLink("Quiet: The Power of Introverts in a World That Can't Stop Talking"), kind: "book" },
    { title: "American Gods", url: wikiLink("American Gods"), kind: "book" },
    { title: "The Three-Body Problem", url: wikiLink("The Three-Body Problem"), kind: "book" },
    { title: "Poor Charlie's Almanack", url: wikiLink("Poor Charlie's Almanack"), kind: "book" },
    { title: "The Dream Machine", url: wikiLink("The Dream Machine"), kind: "book" },
    { title: "A Changing World Order", url: wikiLink("Principles for Dealing with the Changing World Order"), kind: "book" },
    { title: "The Odyssey", url: wikiLink("Odyssey"), kind: "book" }
  ],

  songs: [
    { title: "Lucy — Mt. Joy", url: spotifySearchLink("Lucy Mt. Joy"), kind: "song" },
    { title: "American Pie — Don McLean", url: spotifySearchLink("American Pie Don McLean"), kind: "song" },
    { title: "The Beautiful Game — RAC", url: spotifySearchLink("The Beautiful Game RAC"), kind: "song" },
    { title: "American Beauty — Drew Holcomb", url: spotifySearchLink("American Beauty Drew Holcomb"), kind: "song" },
    { title: "Fire — Langhorne Slim and the Law", url: spotifySearchLink("Fire Langhorne Slim and the Law"), kind: "song" },
    { title: "Virginia — Train", url: spotifySearchLink("Virginia Train"), kind: "song" },
    { title: "Pretty Girl — Lapeer", url: spotifySearchLink("Pretty Girl Lapeer"), kind: "song" },
    { title: "When I've Been Drinking — Jon Pardi", url: spotifySearchLink("When I've Been Drinking Jon Pardi"), kind: "song" },
    { title: "As She's Walking Away — Zac Brown Band", url: spotifySearchLink("As She's Walking Away Zac Brown Band"), kind: "song" },
    { title: "Silver Lining — Mt. Joy", url: spotifySearchLink("Silver Lining Mt. Joy"), kind: "song" }
  ],

  blogs: [
    { title: "Wake for Susan — Cormac McCarthy", url: "https://phoenixmagazine.net/wake-for-susan-by-cormac-mccarthy/", kind: "blog" },
    { title: "The Last Question — Isaac Asimov", url: "https://astronomy.org/moravian/C00-Last%20Question.pdf", kind: "blog" },
    { title: "The Crane Wife — The Paris Review", url: "https://www.theparisreview.org/blog/2019/07/16/the-crane-wife/", kind: "blog" },
    { title: "Ligeia — Edgar Allan Poe", url: "https://poestories.com/read/ligeia", kind: "blog" },
    { title: "Are Ideas Getting Harder to Find? (paper)", url: "https://web.stanford.edu/~chadj/IdeaPF.pdf", kind: "blog" },
    { title: "Gold and Economic Freedom — Alan Greenspan (1967)", url: "https://www.math.snu.ac.kr/~hichoi/finmath/AlanGreenspan-GoldEconomicFreedom.pdf", kind: "blog" },
    { title: "Sleep — Haruki Murakami", url: "https://mylostwords.blogspot.com/2009/01/haruki-murakami-sleep.html", kind: "blog" },
    { title: "Last Night of the World — Ray Bradbury", url: "http://733257565503770808.weebly.com/uploads/1/2/5/5/12551251/bradbury_the_last_night_of_the_world.pdf", kind: "blog" },
    { title: "Techno-Optimist Manifesto — Marc Andreessen", url: "https://pmarca.substack.com/p/the-techno-optimist-manifesto", kind: "blog" },
    { title: "The Gospel of Wealth — Andrew Carnegie", url: "https://media.carnegie.org/filer_public/ab/c9/abc9fb4b-dc86-4ce8-ae31-a983b9a326ed/ccny_essay_1889_thegospelofwealth.pdf", kind: "blog" }
  ]
};

// --- big “all media” list: includes EVERYTHING above + your larger link dump so far ---
const extraLinks = [
  // from your earlier “more links” message and embedded blogs.html snippet (best-effort capture)
  { title: "Ideas into Words — Paul Graham", url: "http://www.paulgraham.com/words.html" },
  { title: "Nerds Are Unpopular — Paul Graham", url: "http://www.paulgraham.com/nerds.html" },
  { title: "Superlinear Returns — Paul Graham", url: "http://paulgraham.com/superlinear.html" },
  { title: "You and Your Research", url: "https://www.cs.virginia.edu/~robins/YouAndYourResearch.html" },
  { title: "Tell Good Stories — Not Boring", url: "https://www.notboring.co/p/tell-good-stories" },
  { title: "AI Will Save the World — a16z", url: "https://a16z.com/2023/06/06/ai-will-save-the-world/" },
  { title: "Technology over the long run — Our World in Data", url: "https://ourworldindata.org/technology-long-run" },
  { title: "Mortality in the Past — Our World in Data", url: "https://ourworldindata.org/child-mortality-in-the-past" },
  { title: "We Wrestle Not With Flesh and Blood — SSC", url: "https://slatestarcodex.com/2013/03/07/we-wrestle-not-with-flesh-and-blood-but-against-powers-and-principalities/" },
  { title: "Things to Think — Collab Fund", url: "https://collabfund.com/blog/thoughts/" },
  { title: "Compounding Optimism — Collab Fund", url: "https://collabfund.com/blog/compounding-optimism/" },
  { title: "Intelligent vs Smart — Collab Fund", url: "https://collabfund.com/blog/intelligent-vs-smart/" },
  { title: "The Antidote to Envy — More to That", url: "https://moretothat.com/the-antidote-to-envy/" },
  { title: "Secretly Hating Bars — Wait But Why", url: "https://waitbutwhy.com/2014/05/secretly-hate-bars.html" },
  { title: "Religion for the Nonreligious — Wait But Why", url: "https://waitbutwhy.com/2014/10/religion-for-the-nonreligious.html" },
  { title: "The Social Mammoth — Wait But Why", url: "https://waitbutwhy.com/2014/06/taming-mammoth-let-peoples-opinions-run-life.html" },
  { title: "Loss Aversion — The Decision Lab", url: "https://thedecisionlab.com/biases/loss-aversion#" },
  { title: "Hulu Investor Letter (2011) — Jason Kilar", url: "https://aletteraday.substack.com/p/letter-74-jason-kilar-2011" },
  { title: "The Writing Life — Annie Dillard (blog post)", url: "https://garyemiller.blogspot.com/2014/07/in-writing-life-annie-dillard-writes.html" },
  { title: "Digital Media Is a Wasteland", url: "https://medium.com/s/story/digital-media-1b2c3783d5b0" },
  { title: "Welcome to 2030 — WEF / Medium", url: "https://medium.com/world-economic-forum/welcome-to-2030-i-own-nothing-have-no-privacy-and-life-has-never-been-better-ee2eed62f710" },
  { title: "Leaving the Cradle", url: "https://medium.com/predict/leaving-the-cradle-e53ce204ed79" },
  { title: "Darwin Economy — Farnam Street", url: "https://fs.blog/the-darwin-economy/" },
  { title: "I, Pencil — FEE", url: "https://fee.org/resources/i-pencil/" },
  { title: "One Art — Poetry Foundation", url: "https://www.poetryfoundation.org/poems/47536/one-art" },
  { title: "This Be the Verse — Poetry Foundation", url: "https://www.poetryfoundation.org/poems/48419/this-be-the-verse" },
  { title: "Good Bones — Poetry Foundation", url: "https://www.poetryfoundation.org/poems/89897/good-bones" },
  { title: "To the Sea — poets.org", url: "https://poets.org/poem/sea-2" },
  { title: "Faces in the Street — poets.org", url: "https://poets.org/poem/faces-street" },
  { title: "Goodbye to All That — Joan Didion (PDF)", url: "https://d242fdlp0qlcia.cloudfront.net/uploads/2015/09/22211308/joan-didion-goodbye-to-all-that-1.pdf" },
  { title: "On Bullshit — Harry Frankfurt (PDF)", url: "http://www2.csudh.edu/ccauthen/576f12/frankfurt__harry_-_on_bullshit.pdf" },
  { title: "Proposal for Summer AI Research (Dartmouth, 1956)", url: "http://jmc.stanford.edu/articles/dartmouth/dartmouth.pdf" },
  { title: "1971 — wtfhappenedin1971", url: "https://wtfhappenedin1971.com/" },
  { title: "The Intrinsic Perspective", url: "https://www.theintrinsicperspective.com/p/high-tech-pastoral-as-the-new-aesthetic" },
  { title: "High Tech Pastoral — Intrinsic Perspective", url: "https://www.theintrinsicperspective.com/p/high-tech-pastoral-as-the-new-aesthetic" },
  { title: "Egregore — Intrinsic Perspective", url: "https://www.theintrinsicperspective.com/p/the-planetary-egregore-passes-you" },
  { title: "The Nerd Problem — Intrinsic Perspective", url: "https://www.theintrinsicperspective.com/p/nerd-culture-is-murdering-intellectuals" },
  { title: "The Algo — Jonathan Haidt", url: "https://jonathanhaidt.substack.com/p/algorithms-hijacked-my-generation" },
  { title: "Free Play / Play Deficit — Jonathan Haidt", url: "https://jonathanhaidt.substack.com/p/the-play-deficit" },
  { title: "Identity Trap — Jonathan Haidt", url: "https://jonathanhaidt.substack.com/p/identity-trap" },
  { title: "Don’t Be a Doomer — Noahpinion", url: "https://noahpinion.substack.com/p/dont-be-a-doomer" },
  { title: "US Cannot Afford to Turn Against Immigration — Noahpinion", url: "https://noahpinion.substack.com/p/the-us-cannot-afford-to-turn-against" },
  { title: "Banning TikTok — Noahpinion", url: "https://noahpinion.substack.com/p/yes-of-course-we-should-ban-tiktok" },
  { title: "Long Distance Thinking — Simon Sarris", url: "https://simonsarris.substack.com/p/long-distance-thinking" },
  { title: "In Praise of the Gods — Simon Sarris", url: "https://simonsarris.substack.com/p/in-praise-of-the-gods" },
  { title: "The Art of Romo", url: "https://wrongalot.substack.com/p/the-art-of-romo" },
  { title: "Economics of Love — David Phelps", url: "https://davidphelps.substack.com/p/economics-of-love" },
  { title: "Bailout Brink — David Phelps", url: "https://davidphelps.substack.com/p/bailout-brink?sd=pf" },
  { title: "Productive Bubbles — The Generalist", url: "https://thegeneralist.substack.com/p/productive-bubbles" },
  { title: "Rebecca Kaden — The Generalist", url: "https://thegeneralist.substack.com/p/rebecca-kaden" },
  { title: "Casino on Mars — Paradigm", url: "https://www.paradigm.xyz/2023/09/casino-on-mars" },
  { title: "Bitcoin is not a hedge — Unchained", url: "https://unchained.com/blog/bitcoin-is-not-a-hedge/" },
  { title: "Engineering of Bitcoin — Caitlin Long", url: "https://caitlin-long.com/the-engineering-of-bitcoin/" },
  { title: "A Crypto Future", url: "https://www.acryptofuture.xyz/" },
  { title: "Quid Pro Stablecoin — Arthur Hayes", url: "https://cryptohayes.substack.com/p/quid-pro-stablecoin" },
  { title: "White Man — Arthur Hayes", url: "https://cryptohayes.medium.com/white-man-5001d38a5e4e" },
  { title: "Kaiseki — Arthur Hayes", url: "https://cryptohayes.medium.com/kaiseki-b15230bdd09e" },
  { title: "Sea Change — Oaktree", url: "https://www.oaktreecapital.com/insights/memo/sea-change" },
  { title: "Why Marketing Is Eating the World — Elizabeth Yin", url: "https://elizabethyin.com/2020/06/30/why-marketing-is-eating-the-world/" },
  { title: "Why is finance so complex? — Interfluidity", url: "https://www.interfluidity.com/v2/2669.html" },
  { title: "Human Scale Organizations", url: "https://eand.co/why-we-need-to-build-human-scale-organizations-978bde798570" },
  { title: "Age of Average", url: "https://www.alexmurrell.co.uk/articles/the-age-of-average" },
  { title: "Remove Barriers to Productivity — City Journal", url: "https://www.city-journal.org/article/remove-barriers-to-productivity" },
  { title: "School Is Not Enough — Palladium", url: "https://www.palladiummag.com/2023/06/06/school-is-not-enough/" },
  { title: "Competence Crisis — Palladium", url: "https://www.palladiummag.com/2023/06/01/complex-systems-wont-survive-the-competence-crisis/" },
  { title: "Surrealism — Cultural Tutor (X)", url: "https://twitter.com/culturaltutor/status/1686694192431366144" }
].map(normalizeItem);

// --- build ALL list ---
function buildAllList() {
  const topLists = [
    ...lists.movies,
    ...lists.tv,
    ...lists.books,
    ...lists.songs,
    ...lists.blogs
  ].map(normalizeItem);

  // Merge, then dedupe by URL (keep first title)
  const merged = [...topLists, ...extraLinks];
  const seen = new Set();
  const deduped = [];

  for (const item of merged) {
    if (!item.url) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  return sortByTitleAZ(deduped);
}

// --- UI wiring ---
const overlay = document.getElementById("overlay");
const modalContent = document.getElementById("modalContent");
const closeBtn = document.getElementById("close");
const windowTitle = document.getElementById("window-title");
const openAllBtn = document.getElementById("openAllInNewTab");

function openModal(title, html, showOpenAll = false, allUrls = []) {
  windowTitle.textContent = title;
  modalContent.innerHTML = html;
  overlay.hidden = false;

  if (showOpenAll) {
    openAllBtn.hidden = false;
    openAllBtn.onclick = () => {
      // browser may block popups if too many; still useful for smaller lists
      allUrls.forEach(u => window.open(u, "_blank", "noopener"));
    };
  } else {
    openAllBtn.hidden = true;
    openAllBtn.onclick = null;
  }
}

function renderTop10(name, items) {
  const clean = items.map(normalizeItem);
  const html = `
    <h2>${name}</h2>
    <ol>
      ${clean.map(x => `<li><a href="${x.url}" target="_blank" rel="noopener">${x.title}</a></li>`).join("")}
    </ol>
    <div class="smallnote">top 10 list</div>
  `;
  openModal(name, html, true, clean.map(x => x.url));
}

function renderAllMedia() {
  const all = buildAllList();
  const html = `
    <h2>all media (A→Z)</h2>
    <ul>
      ${all.map(x => `<li><a href="${x.url}" target="_blank" rel="noopener">${x.title}</a></li>`).join("")}
    </ul>
    <div class="smallnote">auto-sorted alphabetically. deduped by URL.</div>
  `;
  openModal("all media (A→Z)", html, false);
}

document.querySelectorAll(".icon").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.target;

    if (key === "movies") return renderTop10("movies", lists.movies);
    if (key === "tv") return renderTop10("tv", lists.tv);
    if (key === "books") return renderTop10("books", lists.books);
    if (key === "songs") return renderTop10("songs", lists.songs);
    if (key === "blogs") return renderTop10("blogs", lists.blogs);
    if (key === "all") return renderAllMedia();
  });
});

closeBtn.addEventListener("click", () => {
  overlay.hidden = true;
});

// close on overlay click (but not when clicking inside the window)
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) overlay.hidden = true;
});

// escape key closes modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.hidden) overlay.hidden = true;
});
