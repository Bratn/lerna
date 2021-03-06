import dedent from "dedent";
import log from "npmlog";
import path from "path";
import semver from "semver";
import readPkg from "read-pkg";

import FileSystemUtilities from "./FileSystemUtilities";
import dependencyIsSatisfied from "./utils/dependencyIsSatisfied";
import NpmUtilities from "./NpmUtilities";

export default class Package {
  constructor(pkg, location) {
    this._package = pkg;
    this._location = location;
  }

  get name() {
    return this._package.name;
  }

  get location() {
    return this._location;
  }

  get nodeModulesLocation() {
    return path.join(this._location, "node_modules");
  }

  get publishDirectory()
  {
    return this._package.config && this._package.config["publishDirectory"] ?
       this._package.config["publishDirectory"] : null;
  }

  get publishDirectoryLocation()
  {
    return this.publishDirectory ?
      path.join(this.location, this.publishDirectory) : null;
  }

  get version() {
    return this._package.version;
  }

  set version(version) {
    this._package.version = version;
  }

  get bin() {
    return this._package.bin;
  }

  get dependencies() {
    return this._package.dependencies;
  }

  get devDependencies() {
    return this._package.devDependencies;
  }

  get peerDependencies() {
    return this._package.peerDependencies;
  }

  get allDependencies() {
    return Object.assign(
      {},
      this.devDependencies,
      this.dependencies
    );
  }

  get scripts() {
    return this._package.scripts || {};
  }

  isPrivate() {
    // favor custom dist package private mode if exists assuming 'private' is used to determine
    // if the package can be deployed to NPM.
    return this.getPublishDirectoryPackage() ? !!this.getPublishDirectoryPackage().private
      : !!this._package.private;
  }

  toJSON() {
    return this._package;
  }

  /**
   * Run a NPM script in this package's directory
   * @param {String} script NPM script to run
   * @param {Function} callback
   */
  runScript(script, callback) {
    log.silly("runScript", script, this.name);

    if (this.scripts[script]) {
      NpmUtilities.runScriptInDir(script, [], this.location, callback);
    } else {
      callback();
    }
  }

  /**
   * Determine if a dependency version satisfies the requirements of this package
   * @param {Package} dependency
   * @param {Boolean} doWarn
   * @returns {Boolean}
   */
  hasMatchingDependency(dependency, doWarn) {
    log.silly("hasMatchingDependency", this.name, dependency.name);

    const expectedVersion = this.allDependencies[dependency.name];
    const actualVersion = dependency.version;

    if (!expectedVersion) {
      return false;
    }

    // check if semantic versions are compatible
    if (semver.satisfies(actualVersion, expectedVersion)) {
      return true;
    }

    if (doWarn) {
      log.warn(this.name, dedent`
        depends on "${dependency.name}@${expectedVersion}"
        instead of "${dependency.name}@${actualVersion}"
      `);
    }

    return false;
  }

  /**
   * Determine if a dependency has already been installed for this package
   * @param {String} depName Name of the dependency
   * @returns {Boolean}
   */
  hasDependencyInstalled(depName) {
    log.silly("hasDependencyInstalled", this.name, depName);

    return dependencyIsSatisfied(
      this.nodeModulesLocation, depName, this.allDependencies[depName]
    );
  }

  getPublishDirectoryPackage(resolver) {
    if (typeof this._publishDirPackage === "undefined") {
      if (this.publishDirectoryLocation) {
        const publishDirLocation = this.publishDirectoryLocation;
        const publishDirConfigPath = path.join(publishDirLocation, "package.json");
        let publishDirJson = null;

        log.verbose("package " + this.name + " is configured to publish from custom "
          + "directory " + publishDirLocation);

        if (!FileSystemUtilities.existsSync(publishDirConfigPath)) {
          if (resolver)
          {
            publishDirJson = resolver(null);
          }
        } else {
          publishDirJson = readPkg.sync(publishDirConfigPath, { normalize: false });
        }

        if (publishDirJson)
        {
          this._publishDirPackage = new Package(publishDirJson, publishDirLocation);
        }
        else
        {
          const message = "Package " + this.name + " is configured to publish from custom directory " +
            "which doesn't exists or missing 'package.json'";
          log.error("EPKGCONFIG", message);
          throw new Error(message);
        }
      }
    }

    return this._publishDirPackage;
  }
}
