# Releasing VibeFocus

## Version Management

VibeFocus uses a single `VERSION` file at the project root as the source of truth. The backend reads it at startup, and the release process syncs it to `frontend/package.json`.

```bash
# Check current version
make version

# Bump version without releasing
make bump-version VERSION=2.1.0
```

## Creating a Release

```bash
make release VERSION=2.1.0
```

This will:
1. Validate semver format (x.y.z)
2. Check that the tag doesn't already exist
3. Prompt for confirmation
4. Update `VERSION` and `frontend/package.json`
5. Commit the version bump
6. Create an annotated git tag `v2.1.0`
7. Push the commit and tag to origin

### After Releasing

1. **Create a GitHub Release** at https://github.com/ericblue/vibefocus/releases/new — select the tag, write release notes
2. **Build and push Docker images** (optional):
   ```bash
   make docker-build DOCKER_TAG=2.1.0
   make docker-push DOCKER_TAG=2.1.0
   ```

## Fixing a Release Tag

If you need to retag an existing release (e.g., you tagged the wrong commit):

```bash
make release-retag VERSION=2.1.0
```

This deletes the existing tag locally and remotely, then creates a new one at the current HEAD.

## Docker Images

Docker images are tagged with the version from the `VERSION` file by default:

```bash
make docker-build                    # tags as current VERSION
make docker-build DOCKER_TAG=2.1.0   # explicit tag
make docker-push                     # pushes versioned + :latest
```

Images are pushed to `ericblue/vibefocus-backend` and `ericblue/vibefocus-frontend` on Docker Hub. When pushing a versioned tag, `:latest` is also updated automatically.

## Version Locations

| Location | Updated by | Read by |
|----------|-----------|---------|
| `VERSION` | `make release` / `make bump-version` | Backend at startup, Makefile |
| `frontend/package.json` | `make release` / `make bump-version` | Frontend build |
| `GET /version` | — | API consumers |
| `GET /health` | — | Health checks (includes version) |

## Versioning Scheme

VibeFocus follows [Semantic Versioning](https://semver.org/):

- **Major** (x.0.0): Breaking API changes, major UI overhauls
- **Minor** (0.x.0): New features, non-breaking additions
- **Patch** (0.0.x): Bug fixes, minor UI tweaks
