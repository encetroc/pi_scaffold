# Templates ship inside the single, git-tracked package

Scafstak is one repo: extension code plus `templates/` are all versioned
together and distributed as one pi package (`pi install git:...`). "Updatable"
means an agent edits template files and you commit; users pull new versions via
`pi update`. Rejected: a separate templates-only repo that the extension
git-pulls at runtime — the pull step would rarely be run and adds update
machinery for a solo user who already ships the whole thing as code.
