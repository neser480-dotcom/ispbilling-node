/*
|--------------------------------------------------------------------------
| MIKROTIK CONFIG PAGE – TABLE HEADER SORT (UI ONLY)
|--------------------------------------------------------------------------
| শুধু টেবিলের সারির দেখানোর ক্রম বদলায় (এবং # নম্বর নতুন করে বসায়)।
| ডাটাবেস / API / mikrotik.js এর কোনো ডাটা বা রিকোয়েস্টে হাত দেয় না।
| মুছে দিলেও পেজের বাকি সব কাজ আগের মতো চলবে।
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", function () {

    "use strict";

    const table =
        document.querySelector(".mk-table");

    if (!table) {
        return;
    }

    const tbody =
        table.querySelector("tbody");

    if (!tbody) {
        return;
    }

    const collator =
        new Intl.Collator(
            undefined,
            {
                numeric: true,
                sensitivity: "base"
            }
        );

    let sortCol = -1;
    let sortDir = 1;


    function cellText(row, col) {

        const cell =
            row.children[col];

        return cell
            ? cell.textContent.trim()
            : "";

    }


    function updateIcons() {

        table
            .querySelectorAll("thead th[data-sort-col]")
            .forEach(
                function (th) {

                    const icon =
                        th.querySelector(".sort-icon");

                    if (!icon) {
                        return;
                    }

                    icon.textContent =
                        Number(th.dataset.sortCol) === sortCol
                            ? (sortDir === 1 ? "↑" : "↓")
                            : "⇅";

                }
            );

    }


    table
        .querySelectorAll("thead th[data-sort-col]")
        .forEach(
            function (th) {

                th.addEventListener(
                    "click",
                    function () {

                        const col =
                            Number(th.dataset.sortCol);

                        if (sortCol === col) {

                            sortDir = -sortDir;

                        } else {

                            sortCol = col;
                            sortDir = 1;

                        }


                        // "Loading..." / "No data" সারি (colspan) বাদ
                        const rows =
                            Array.from(
                                tbody.querySelectorAll("tr")
                            ).filter(
                                function (tr) {

                                    return tr.children.length > 1 &&
                                        !tr.querySelector("td[colspan]");

                                }
                            );

                        if (!rows.length) {
                            return;
                        }


                        rows.sort(
                            function (a, b) {

                                return collator.compare(
                                    cellText(a, col),
                                    cellText(b, col)
                                ) * sortDir;

                            }
                        );


                        rows.forEach(
                            function (tr, index) {

                                tbody.appendChild(tr);

                                const first =
                                    tr.children[0];

                                // শুধু সাধারণ ক্রমিক নম্বর হলেই নতুন নম্বর বসাবে
                                if (
                                    first &&
                                    /^\d+$/.test(
                                        first.textContent.trim()
                                    )
                                ) {

                                    first.textContent =
                                        index + 1;

                                }

                            }
                        );

                        updateIcons();

                    }
                );

            }
        );

});
