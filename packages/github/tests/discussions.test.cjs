const assert = require("node:assert/strict");
const test = require("node:test");

const { MockGitHubProvider } = require("../.test-dist/mock.js");

test("mock provider resolves and enables repository Discussions", async () => {
  const provider = new MockGitHubProvider("octocat");
  await provider.createRepo({
    name: "discussion-site",
    description: "Discussion test",
    private: false,
    template: "landing",
  });

  const initial = await provider.getDiscussionSetup({
    owner: "octocat",
    repo: "discussion-site",
  });
  assert.equal(initial.repo, "octocat/discussion-site");
  assert.match(initial.repoId, /^R_mockRepository/);
  assert.equal(initial.enabled, false);
  assert.deepEqual(initial.categories, []);

  const enabled = await provider.enableDiscussions({
    owner: "octocat",
    repo: "discussion-site",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.categories[0].name, "Announcements");
  assert.match(enabled.categories[0].id, /^DIC_mockAnnouncements/);
});
