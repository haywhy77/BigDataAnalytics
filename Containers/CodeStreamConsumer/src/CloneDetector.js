const emptyLine = /^\s*$/;
const oneLineComment = /\/\/.*/;
const oneLineMultiLineComment = /\/\*.*?\*\//; 
const openMultiLineComment = /\/\*+[^\*\/]*$/;
const closeMultiLineComment = /^[\*\/]*\*+\//;

const SourceLine = require('./SourceLine');
const FileStorage = require('./FileStorage');
const Clone = require('./Clone');

const DEFAULT_CHUNKSIZE = 5;

class CloneDetector {
    #myChunkSize = process.env.CHUNKSIZE || DEFAULT_CHUNKSIZE;
    #myFileStore = FileStorage.getInstance();

    constructor() {}

    // Private Methods
    #filterLines(file) {
        let lines = file.contents.split('\n');
        let inMultiLineComment = false;
        file.lines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            if (inMultiLineComment) {
                if (line.search(closeMultiLineComment) !== -1) {
                    line = line.replace(closeMultiLineComment, '');
                    inMultiLineComment = false;
                } else {
                    line = ''; // Skip this line if inside a multi-line comment
                }
            }

            line = line.replace(emptyLine, '');
            line = line.replace(oneLineComment, '');
            line = line.replace(oneLineMultiLineComment, '');
            
            if (line.search(openMultiLineComment) !== -1) {
                line = line.replace(openMultiLineComment, '');
                inMultiLineComment = true;
            }

            file.lines.push(new SourceLine(i + 1, line.trim()));
        }

        return file;
    }

    #getContentLines(file) {
        return file.lines.filter(line => line.hasContent());
    }

    #chunkify(file) {
        let chunkSize = this.#myChunkSize;
        let lines = this.#getContentLines(file);
        file.chunks = [];

        for (let i = 0; i <= lines.length - chunkSize; i++) {
            let chunk = lines.slice(i, i + chunkSize);
            file.chunks.push(chunk);
        }
        return file;
    }

    #chunkMatch(first, second) {
        if (first.length !== second.length) return false;
        return first.every((line, idx) => line.equals(second[idx]));
    }

    #filterCloneCandidates(file, compareFile) {
        file.instances = file.instances || [];
       
        let newInstances = file.chunks.flatMap((chunk) => {
            let matchingChunks = compareFile.chunks.filter(compareChunk =>
                this.#chunkMatch(chunk, compareChunk)
            );

            return matchingChunks.map(match => new Clone(file.name, compareFile.name, chunk, match));
        });

        file.instances = file.instances.concat(newInstances);
        console.log(`filterCloneCandidates for ${file.name} with ${compareFile.name}: ${JSON.stringify(file.instances)}`);
        return file;
    }
     
    #expandCloneCandidates(file) {
        file.instances = file.instances.reduce((expanded, current) => {
            let expandedClone = expanded.find(clone => clone.maybeExpandWith(current));
            if (!expandedClone) {
                expanded.push(current); // Add new clone if no overlap
            }
            return expanded;
        }, []);
        console.log(`expandCloneCandidates: ${JSON.stringify(file.instances)}`);
        return file;
    }

    #consolidateClones(file) {
        file.instances = file.instances.reduce((uniqueClones, currentClone) => {
            let existingClone = uniqueClones.find(clone => clone.equals(currentClone));
            if (existingClone) {
                existingClone.addTarget(currentClone);
            } else {
                uniqueClones.push(currentClone);
            }
            return uniqueClones;
        }, []);
        console.log(`consolidateClones: ${JSON.stringify(file.instances)}`);
        return file;
    }

    // Public Processing Steps
    preprocess(file) {
        return new Promise((resolve, reject) => {
            if (!file.name.endsWith('.java')) {
                reject(`${file.name} is not a Java file. Discarding.`);
            } else if (this.#myFileStore.isFileProcessed(file.name)) {
                reject(`${file.name} has already been processed.`);
            } else {
                resolve(file);
            }
        });
    }

    transform(file) {
        file = this.#filterLines(file);
        file = this.#chunkify(file);
        return file;
    }

    matchDetect(file) {
        let allFiles = this.#myFileStore.getAllFiles();
        file.instances = file.instances || [];
   
        for (let f of allFiles) {
            console.log(`Comparing ${file.name} with ${f.name}`);

            // Step 1: Detect initial matches
            file = this.#filterCloneCandidates(file, f);

            // Step 2: Expand clones by merging overlaps
            file = this.#expandCloneCandidates(file);

            // Step 3: Consolidate duplicate clones
            file = this.#consolidateClones(file);

            // Check if instances are available before attempting to create a new Clone
            if (file.instances && file.instances.length > 0) {
                try {
                    // Create a new Clone with the first instance
                    let clone = new Clone(file.instances[0]);
                    // Process the clone (add your logic here)
                } catch (error) {
                    console.error('Error creating Clone:', error.message);
                }
            } else {
                console.warn(`No clones found for ${file.name} when comparing with ${f.name}`);
            }
        }
   
        console.log(`Total clones detected in ${file.name}: ${file.instances.length}`);
   
        return file;
    }
        
    pruneFile(file) {
        delete file.lines;
        delete file.instances;
        return file;
    }
    
    storeFile(file) {
        this.#myFileStore.storeFile(this.pruneFile(file));
        return file;
    }

    get numberOfProcessedFiles() { return this.#myFileStore.numberOfFiles; }
}

module.exports = CloneDetector;