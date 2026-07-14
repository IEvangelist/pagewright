const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const {
  applyLegacyMarkdownDraft,
  createPostComponent,
  getGitHubDiscussionsConfigIssues,
  movePostComponent,
  postComponentRegistry,
  removePostComponent,
  updatePostComponent,
} = require("../.test-dist/post-components.js");
const { parsePost, postComponentsSchema } = require("../.test-dist/schema.js");
const { GitHubDiscussions } = require("../.test-dist/blocks/index.js");

const validDiscussionProps = {
  repo: "octocat/pagewright-blog",
  repoId: "R_testRepository123",
  category: "Announcements",
  categoryId: "DIC_testCategory123",
  mapping: "pathname",
  strict: true,
  reactionsEnabled: true,
  inputPosition: "top",
  theme: "preferred_color_scheme",
  lang: "en",
};

test("existing prose-only posts remain valid and receive defaults", () => {
  const post = parsePost({
    title: "Legacy post",
    slug: "legacy-post",
    date: "2026-07-13T00:00:00.000Z",
    blocks: [{ type: "prose", id: "body", props: { html: "<p>Still here.</p>" } }],
  });

  assert.equal(post.blocks.length, 1);
  assert.equal(post.blocks[0].type, "prose");
  assert.equal(post.blocks[0].props.html, "<p>Still here.</p>");
  assert.deepEqual(post.tags, []);
  assert.equal(post.draft, false);
});

test("legacy posts with visual page blocks remain valid", () => {
  const post = parsePost({
    title: "Legacy visual post",
    slug: "legacy-visual-post",
    date: "2026-07-13T00:00:00.000Z",
    blocks: [{ type: "hero", id: "intro", props: { heading: "Still editable" } }],
  });

  assert.equal(post.blocks[0].type, "hero");
  assert.equal(post.blocks[0].props.heading, "Still editable");
});

test("discussion components serialize and parse without losing configuration", () => {
  const post = parsePost({
    title: "Comments",
    slug: "comments",
    date: "2026-07-13T00:00:00.000Z",
    blocks: [
      { type: "prose", id: "body", props: { markdown: "Hello", html: "<p>Hello</p>" } },
      { type: "githubDiscussions", id: "comments", props: validDiscussionProps },
    ],
  });
  const reparsed = parsePost(JSON.parse(JSON.stringify(post)));

  assert.deepEqual(reparsed, post);
  assert.equal(reparsed.blocks[1].type, "githubDiscussions");
  assert.equal(reparsed.blocks[1].props.mapping, "pathname");
});

test("the post-component registry supports add, update, reorder, and remove", () => {
  const text = createPostComponent("prose", { id: "text" });
  const discussion = createPostComponent("githubDiscussions", {
    id: "comments",
    repo: "octocat/pagewright-blog",
  });

  let components = [text, discussion];

  assert.deepEqual(Object.keys(postComponentRegistry), ["prose", "githubDiscussions"]);
  components = movePostComponent(components, "comments", 0);
  assert.deepEqual(components.map((component) => component.id), ["comments", "text"]);

  components = updatePostComponent(components, "comments", {
    repoId: "R_testRepository123",
  });
  assert.equal(components[0].props.repoId, "R_testRepository123");

  components = removePostComponent(components, "text");
  assert.deepEqual(components.map((component) => component.id), ["comments"]);
});

test("discussion components accept Pagewright-resolved repository defaults", () => {
  const discussion = createPostComponent("githubDiscussions", {
    id: "comments",
    repo: "octocat/pagewright-blog",
    repoId: "R_testRepository123",
    category: "Announcements",
    categoryId: "DIC_testCategory123",
  });

  assert.equal(discussion.props.repo, "octocat/pagewright-blog");
  assert.equal(discussion.props.repoId, "R_testRepository123");
  assert.equal(discussion.props.category, "Announcements");
  assert.equal(discussion.props.categoryId, "DIC_testCategory123");
  assert.equal(discussion.props.mapping, "pathname");
  assert.equal(getGitHubDiscussionsConfigIssues(discussion.props).length, 0);
});

test("posts allow only one discussion component", () => {
  const discussion = createPostComponent("githubDiscussions", {
    id: "comments",
    ...validDiscussionProps,
  });
  const result = postComponentsSchema.safeParse([
    discussion,
    { ...discussion, id: "more-comments" },
  ]);

  assert.equal(result.success, false);
  assert.throws(() =>
    parsePost({
      title: "Duplicate comments",
      slug: "duplicate-comments",
      date: "2026-07-13T00:00:00.000Z",
      blocks: [discussion, { ...discussion, id: "more-comments" }],
    }),
  );
});

test("legacy local Markdown drafts migrate into the first text component", () => {
  const text = createPostComponent("prose", { id: "text" });
  const discussion = createPostComponent("githubDiscussions", { id: "comments" });
  const migrated = applyLegacyMarkdownDraft([discussion, text], "# Recovered");

  assert.equal(migrated[0].type, "githubDiscussions");
  assert.equal(migrated[1].type, "prose");
  assert.equal(migrated[1].props.markdown, "# Recovered");
  assert.equal(migrated[1].props.html, "");

  const inserted = applyLegacyMarkdownDraft([discussion], "Recovered", "recovered");
  assert.equal(inserted[0].id, "recovered");
  assert.equal(inserted[0].props.markdown, "Recovered");
});

test("discussion validation reports setup and mapping-specific problems", () => {
  const empty = createPostComponent("githubDiscussions", { id: "comments" });
  assert.deepEqual(
    getGitHubDiscussionsConfigIssues(empty.props).map((issue) => issue.field),
    ["repo", "repoId", "category", "categoryId"],
  );
  assert.equal(getGitHubDiscussionsConfigIssues(validDiscussionProps).length, 0);
  assert.equal(
    getGitHubDiscussionsConfigIssues({
      ...validDiscussionProps,
      mapping: "specific",
      term: "",
    }).at(-1).field,
    "term",
  );
  assert.equal(
    getGitHubDiscussionsConfigIssues({
      ...validDiscussionProps,
      mapping: "number",
    }).at(-1).field,
    "discussionNumber",
  );
});

test("configured discussions render the official Giscus client and accessible sign-in state", () => {
  const html = renderToStaticMarkup(
    React.createElement(GitHubDiscussions, validDiscussionProps),
  );

  assert.match(html, /src="https:\/\/giscus\.app\/client\.js"/);
  assert.match(html, /data-repo="octocat\/pagewright-blog"/);
  assert.match(html, /data-mapping="pathname"/);
  assert.match(html, /data-loading="lazy"/);
  assert.match(html, />Sign in with GitHub</);
  assert.match(html, /Loading discussion/);
});

test("discussion-number mapping uses the Giscus term attribute", () => {
  const html = renderToStaticMarkup(
    React.createElement(GitHubDiscussions, {
      ...validDiscussionProps,
      mapping: "number",
      discussionNumber: 42,
    }),
  );

  assert.match(html, /data-term="42"/);
  assert.doesNotMatch(html, /data-number=/);
});

test("incomplete discussions render a setup state without loading Giscus", () => {
  const component = createPostComponent("githubDiscussions", { id: "comments" });
  const html = renderToStaticMarkup(
    React.createElement(GitHubDiscussions, component.props),
  );

  assert.doesNotMatch(html, /giscus\.app\/client\.js/);
  assert.match(html, /Comments are not configured yet/);
  assert.match(html, /Open the Giscus setup guide/);
});
