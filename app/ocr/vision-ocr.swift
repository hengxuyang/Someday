// Local OCR via Apple Vision. Usage: vision-ocr <image-path>
// Prints recognised text to stdout, one line per text region, in reading order.
import Foundation
import Vision
import ImageIO

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("usage: vision-ocr <image-path>\n".utf8))
    exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write(Data("cannot read image\n".utf8))
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

// Screenshots mix scripts (English captions over Chinese/Japanese/Korean text). With the default
// Latin-only setting Vision turns CJK into gibberish, so ask for several languages explicitly.
// Override with SOMEDAY_OCR_LANGS, e.g. "en-US,zh-Hans,th-TH". Earlier entries take priority.
let wanted = (ProcessInfo.processInfo.environment["SOMEDAY_OCR_LANGS"] ?? "en-US,zh-Hans,zh-Hant,ja-JP,ko-KR")
    .split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
let supported = (try? request.supportedRecognitionLanguages()) ?? []
let languages = wanted.filter { supported.contains($0) }
if !languages.isEmpty {
    request.recognitionLanguages = languages
} else if #available(macOS 13.0, *) {
    request.automaticallyDetectsLanguage = true
}

do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    FileHandle.standardError.write(Data("ocr failed: \(error)\n".utf8))
    exit(1)
}

// Vision returns observations roughly bottom-up; sort top-to-bottom, then left-to-right.
let observations = (request.results ?? []).sorted {
    let dy = $0.boundingBox.midY - $1.boundingBox.midY
    return abs(dy) > 0.01 ? dy > 0 : $0.boundingBox.minX < $1.boundingBox.minX
}
for obs in observations {
    // Icons and decoration often "read" as low-confidence noise; drop it.
    if let top = obs.topCandidates(1).first, top.confidence >= 0.3 { print(top.string) }
}
