# Contour feedback forms

One page for every resource. The link decides which resource and whether it is the student or tutor form.

## Links (put these in the QR codes)

Student form, printed at the end of each workbook, homework, quiz and practice exam:

    https://contour-vse.github.io/feedback/?r=<resource id>

Tutor form, printed in the tutor solutions version:

    https://contour-vse.github.io/feedback/?r=<resource id>&role=tutor

Examples (Year 8 Week 1 Quantitative Reasoning):

| Resource | Student | Tutor |
|---|---|---|
| Workbook | `/feedback/?r=y8-qr-1-1-wb` | `/feedback/?r=y8-qr-1-1-wb&role=tutor` |
| Homework | `/feedback/?r=y8-qr-1-1-hw` | `/feedback/?r=y8-qr-1-1-hw&role=tutor` |
| Quiz | `/feedback/?r=y8-qr-1-1-quiz` | `/feedback/?r=y8-qr-1-1-quiz&role=tutor` |

## Resource ids

Pattern: `y<year>-<subject>-<term>-<week>-<type>`, all lower case.

* subject: `qr`, `ma`, `re`, `vr`, `wr`
* type: `wb` workbook, `hw` homework, `quiz`, `exam` practice exam

Add each new resource to `resources.js` (title, sections in booklet order, three "I could now..." skills, tutor struggle taps). An id that is not in the list still works: it shows generic sections and is saved under that id.

Campus names live in the `CAMPUSES` list at the top of `resources.js`.

## Where answers go

Answers POST to `window.CONTOUR_ENDPOINT` in `/config.js` (action `feedback.submit`) and land in the Feedback tab of the Contour Sheet. With no endpoint, or offline, answers wait on the device and send on the next visit.

## Reading the results

Open `/feedback/results.html`, then drop in a CSV download of the Feedback tab.
