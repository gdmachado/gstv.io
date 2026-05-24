---
date: 2026-05-15T00:00:00+01:00
lastmod: 2026-05-22T00:00:00+01:00
title: "The Tiny Watermark Table of Doom"
slug: pipeline-watermark-table-of-doom
author: "Gus Machado"
license: "CC BY 4.0"
tags:
  - Data Engineering
  - Pipelines
  - Incremental Processing
  - Watermarks
draft: false
description: "A watermark table is easy to explain, easy to query, and weirdly good at becoming the second truth nobody wanted."
showToc: true
TocOpen: true
hidemeta: false
comments: false
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
ShowRssButtonInSectionTermList: true
UseHugoToc: true
cover:
  image: "images/cover.png"
  alt: "Doom-style pixel-art cover showing a walking database table in a hellscape."
  caption: "Small tables can still carry large outages."
  relative: true
  hidden: false
---

Every Data Engineer has built one at some point. Most of us love it. You’re maintaining incremental pipelines, and at some point, it makes sense to use a simple, cute state table. Something straightforward like:

```sql
CREATE TABLE my_pipeline_watermarks (
    pipeline_name text PRIMARY KEY,
    watermark timestamp NOT NULL,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

Nothing wrong with it, right? In fact, it has a lot going for it. It’s very easy to debug and update. You just wrap your entire logic in a transaction, and you’re done. During an incident, you can point to it and say “this is how far the pipeline has processed,” which gives data engineers a brief sense of control. The SQL transformation becomes simpler too: instead of making the target table part of the state model, you keep progress in a single, neat place.

The danger is not that the design is bad. The danger is that it works so well in the happy path to sneak into the platform, the runbooks and the shared illusion we call "best practice''. Before long, it’s another piece of production state you have to keep straight while debugging an ingestion outage at 6:58 PM on a Friday, right after someone asks if you've tried restarting Airflow.

The drawback of a separate watermark table isn’t that it can’t be made transactionally correct; of course, it can. The issue is that it introduces another durable object with its own lifecycle that must stay in sync with the data it describes. Every backfill, replay, delete, restore, migration, and manual repair adds another thing to remember. The straightforward path gets a bit easier, but the complex path - the one the on-call engineer has to deal with - now has a new footgun wrapped up in a tidy schema.

## The dangerous middle

Before the comment section starts installing Flink in my kitchen: this is not an argument against every metadata table that stores progress.

Migration tools have schema history tables. Ingestion connectors have checkpoints. Stream processors have state backends, offsets, checkpoints, savepoints, and recovery protocols. Those systems absolutely maintain state outside the business data, and that is often the right thing.

The difference is ownership.

A migration metadata table is owned by the migration tool. A stream processor’s checkpoint is owned by the stream processor. A connector offset is owned by the connector. The normal human instruction is not “open the table and update the row by hand.” The tool advances the state, validates it, restores it, and gives you a supported operational model for replay and recovery.

This post is about a different creature: the hand-rolled incremental transformation in a warehouse, lakehouse, or analytical database. The Airflow task. The Python job. The dbt model with custom incremental logic. The Spark microbatch. The SQL script that reads yesterday’s data, writes today’s table, and advances a cute little row called `last_processed_at`.

In that world, you don’t always have a framework-owned checkpoint protocol. When the data needs fixing, the state often does too. If the state lives in a separate watermark table, “repair” usually means someone like Bob running an `UPDATE` or `DELETE` on production metadata, while everyone hopes he chose the right timestamp.

That’s the tiny table of doom.

## Nobody pages you for the straightforward path.

The transactional pipeline looks like this:

```sql
BEGIN;

SELECT
    watermark
FROM
    my_pipeline_watermarks
WHERE
    pipeline_name = 'my_awesome_pipeline'
FOR UPDATE;

CREATE TEMP TABLE next_batch
ON COMMIT DROP
AS
SELECT *
FROM
    my_source_table
WHERE
    record_ts > (
        SELECT
            watermark
        FROM
            my_pipeline_watermarks
        WHERE
            pipeline_name = 'my_awesome_pipeline'
    );

INSERT INTO my_awesome_table (
    ...
)
SELECT
    ...
FROM
    next_batch;

UPDATE my_pipeline_watermarks
SET
    watermark = COALESCE(
        (SELECT MAX(record_ts) FROM next_batch),
        watermark
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE
    pipeline_name = 'my_awesome_pipeline';

COMMIT;
```

At first glance, this looks airtight. Data writes and state updates are wrapped in a single transaction. All-or-nothing, just like the textbooks promised. Throw in a row lock and a unique key, run it on Postgres or anything that can spell 'ACID,' and the classic 'what if the insert works but the watermark update fails?' nightmare fades away.

But that’s not the real problem. The real problem is what happens next week.

The transaction context protects a single batch of the pipeline, but it does not safeguard the table's operational life. It doesn’t protect the state table from a future backfill and doesn’t ensure that a later restore includes both the destination table and its current watermark row. More importantly, it doesn’t prevent someone from forgetting to reset the watermark state after deleting a problematic or outdated slice of data.

Aside from documentation and the collective memory of whoever is on call, nothing captures the relationship between “these rows exist” and “this pipeline has processed data up to this point”. And that distinction matters.

Most bugs in data platforms don’t come from the simple routine tasks that do something impossible. They come from unexpected scenarios: replays, fixing issues, the 10B-row Debezium snapshot someone triggered during business hours (this happened to me last week), occasional full refreshes, slice reprocessing, or that tiny urgent fix for a customer where everyone agrees isn't ideal, but necessary before the next escalation.

The state table is happy when the system is happy. The real concern is how problematic it becomes when the system is maintained by tired individuals with production access and too much caffeine.

## You’ve created two durable truths.

As long as the watermark exists outside the destination table, the pipeline state resides in two locations.

The data states:

> These are the rows this pipeline has produced.

The watermark table states:

> This is how far our pipeline believes it has processed.

The two are meant to represent the same reality, but they are no longer the same object. Any normal operation can cause them to drift apart. Not because of outrageous failure modes, poorly designed pipelines, or the new intern messing up an UPDATE without a WHERE. Just the typical maintenance that every real data platform eventually requires.

Imagine a pipeline bug is deployed on Monday and only discovered on Wednesday. Since the table wasn’t fully reprocessed, the bad logic only affected records that arrived since Monday. The clear fix is to remove the flawed data from the destination, correct the pipeline, and allow it to naturally reprocess the data.

With an external watermark table, that fix becomes more complex; it’s not just about deleting the bad slice anymore. It now involves “DELETE the bad rows, and please please remember to update the watermark to the correct previous value - make no mistakes”. If the table is restored from a backup, the watermark must be restored as well, requiring that the data and watermark backups be in sync. If the table is migrated, the state row must be migrated as well. If the data is rebuilt from scratch, the watermark has to be reset. If a downstream table is rebuilt from this one, its state might also need to be transferred.

None of this is impossible. That’s not the point. The point is you’ve upgraded a simple repair into a two-object choreography. Now, correctness depends on the operator remembering the secret handshake: which timestamp, which timezone, which row, which table. All this trust, placed in a table that looked too innocent to ever betray you.

Documentation helps, but documentation is not a transaction. Runbooks help, but runbooks are not referential integrity. Access control helps, but someone still needs permission to fix production, and that someone may be you during an incident with five people watching and one person asking whether there is “any update for leadership”.

At this point, the watermark table stops being 'just metadata' and starts acting like a tiny shadow database glued to your real one. It needs backups, restores, migrations, permissions, tests, and the occasional exorcism. It is production state, no matter how small it looks in the ERD.

## The state table moves complexity out of the SQL and into operations.

The appeal of the side table is real. It makes the first SQL version cleaner. You don't need to ask the destination table anything. The job reads the current watermark, filters the source, writes the target, advances the watermark, and exits. That is a nice mental model for development, and it often works well for scheduled execution as well.

The complexity didn’t vanish. It just packed its bags and moved to operations.

Instead of carrying progress information in the destination table, you carry it in a separate state table. Instead of deriving state from the data that users actually query, you rely on another object to tell you what that data is supposed to represent. Instead of a rebuild naturally resetting progress, a rebuild now needs an accompanying state mutation. Instead of a delete naturally moving the observable frontier of the table backwards, a delete can leave the watermark pointing past data that no longer exists.

This is the kind of tradeoff that looks tiny in a design doc and enormous in production. The doc says 'pipeline progress is stored in pipeline_watermarks.' Production says, 'We restored the customer table to yesterday, but the watermark still says today, so the pipeline is skipping the records that would actually fix things.' The doc says, 'manual repairs should update state.' Production says 'Bob updated state, but Bob picked the event timestamp instead of the processing timestamp, because both columns sounded reasonable and time is still the best distributed systems prank humanity ever pulled.'

Bob is not the bug. Bob is a constant. Good systems survive Bob.

The stronger design is often the one in which the obvious repair is also the correct one. If deleting bad rows causes the pipeline to revisit that range, the progress marker should move with those rows. If rebuilding the table should reset its progress, then progress should be rebuilt along with the table. If restoring the data should restore the pipeline’s understanding of where it got to, then that understanding should not live in a separate table that someone has to remember to restore.

## Let the table describe itself.

{{< callout kind="warning" title="Caveat" >}}
Small terminology note: I am using `watermark` in the warehouse-person sense: the durable progress marker a batch job uses to decide what source work it can skip next time. In stream processing, the word has a more specific meaning; that is not the thing I am arguing about here.

I am going to use a timestamp as the example cursor because it is readable. Do not mistake that for advice to use event time as your checkpoint. In real systems, the right progress marker might be a Kafka offset, database LSN, source sequence number, ingestion timestamp, snapshot version, per-partition position, or a structured map of several frontiers.

For now, `record_ts` is just the example-shaped cursor. The argument here is about lifecycle, not clocks.
{{< /callout >}}

The alternative is to store enough source progress information in the destination table that the next run can derive its starting point from the data itself.

In the smallest, most example-friendly version, that progress marker is a source timestamp (yes, I know):

```sql
CREATE TABLE my_awesome_table (
    order_id text not null,
    customer_id text not null,
    order_status text not null,
    amount numeric not null,
    source_cursor_ts timestamp not null
);
```

The next run can derive its watermark from the target:

```sql
WITH current_watermark AS (
    SELECT COALESCE(
        MAX(source_cursor_ts),
        TIMESTAMP '1970-01-01'
    ) AS watermark
    FROM my_awesome_table
),
next_batch AS (
    SELECT *
    FROM my_source_table
    WHERE record_ts > (
        SELECT watermark
        FROM current_watermark
    )
)
INSERT INTO my_awesome_table (
    ...
)
SELECT
    ...
FROM next_batch;
```

This isn't more clever than the state table. It is arguably less elegant on first read. The target table now has a metadata column. The query has to inspect the table it writes to. You may need to think about indexes, partitioning, clustering, statistics, or whatever your engine uses to avoid turning MAX(source_cursor_ts) into a tragic full-table scan. The pattern asks more from the table design.

But the life cycle story is much better.

If you fully refresh the table, the watermark is rebuilt during the refresh. If you delete the last seven days of output, the generated watermark moves with the remaining rows back. If you restore the table, you restore both user-visible data and the source progress it represents. If you inspect the destination, you can see not only the business columns, but also the source frontier the table has reached. The table becomes self-describing in a way that is operationally useful, not just aesthetically pleasing.

The important part is not the timestamp. The important part is the coupling. The progress marker is committed with the rows it describes, removed when those rows are removed, restored when those rows are restored, and rebuilt when those rows are rebuilt. You have fewer objects to keep coherent because the state moved into the object whose state you actually care about.

{{< callout kind="info" title="Again: the timestamp is not the point." >}}
Before the pitchforks come out: the point is that the progress marker, whatever shape it takes, is a claim about what source state is represented in the destination. If that claim describes the destination, the destination should usually be able to describe the claim itself.
{{< /callout >}}

## Multi-source models do not rescue the tiny watermark table. They usually make it worse.

If a table depends on orders, payments, refunds, account state, and feature flags, then one tasteful value called `last_processed_at` is probably already lying to you. The progress marker's shape should match the pipeline's shape. Sometimes that means one cursor. Sometimes it means several frontiers. Sometimes it means offsets, LSNs, or something uglier.

But a detached global state table does not remove that complexity. It just gives the complexity somewhere quieter to disappoint you.

## Empty batches do not get you off the hook.

There is one awkward case people correctly bring up with inline progress: what happens when the source advances but the destination emits no rows?

Suppose the pipeline reads a batch of source records and filters them all out. Maybe they are no-op updates. Maybe they are soft deletes. Maybe they refer to entities outside the scope of this model. Maybe they are valid source records that simply do not produce business output in this particular table. The source has moved forward, but the destination has no new rows to carry that progress.

That is a real problem. It is just not a knockout argument for a detached watermark table.

What it actually tells you is that “store the watermark on every emitted row” is the simplest version of the pattern, not the whole pattern. The broader rule is that progress should move with the data product’s lifecycle. If the data is rebuilt, progress should be rebuilt. If the data is restored, progress should be restored. If part of the data is deleted and then replayed, progress should be obvious from the same operational procedure.

There are a few ways to do that, none of them free.

For append-only tables where empty batches are rare and bounded, you may simply accept repeated reads over the empty gap. The next run sees the same source records, filters them again, and eventually advances once a later batch produces output. That is not beautiful, but if the cost is tiny and the behaviour is understood, it may be perfectly fine. Not every edge case needs a distributed systems dissertation taped to it.

For upsert-shaped tables, you can sometimes carry progress by updating or re-emitting a real row touched by the pipeline. For example, if the pipeline maintains one row per entity, a batch that observes source progress but produces no material business change may still update pipeline metadata for an existing entity row. Another variation is to replay or upsert the last batch, or a representative record from it, with an advanced progress marker so the destination can carry the frontier across the empty gap.

That keeps the progress state inside the destination table without inventing a fake domain object. It does, however, require care. You need to understand write amplification, update semantics, audit columns, downstream change capture, cache invalidation, and whether “this row was updated” means something business-facing elsewhere. Metadata-only updates are still updates. They do not become harmless because we gave the column a sensible name and asked nicely.

For more complex cases, you may need an explicit progress carrier: a small batch ledger, a per-table progress relation, or some other metadata object that belongs to the data product. At that point, yes, you have introduced state outside the business rows. But that is different from casually dropping everything into one global pipeline_watermarks table and hoping runbooks will save you. The progress object should be scoped, owned, migrated, restored, and rebuilt with the table it describes. It should be treated as part of the data product, not as an invisible clipboard floating somewhere near the scheduler.

What you probably do not want is a fake sentinel row in the business table:

```sql
customer_id = '__watermark__'
```

That starts as a clever workaround and ends as folklore. Every downstream query needs to remember to exclude the fake row. Every new engineer has to learn that one row in the table is not really a row. Every invariant grows an exception. Eventually, someone forgets, and your analytics now include a haunted customer whose only purchase was pipeline state. Sentinel rows are side tables wearing a fake moustache.

The empty-batch problem is useful because it forces the real design question: what object carries progress when no business output is produced? There is no universal answer. The wrong answer is pretending the problem does not exist. The slightly less wrong answer is creating a tiny detached state table by default. The better answer is to make the carrier explicit and keep it tied to the lifecycle of the data it describes.

## `MAX(...)` needs to be cheap.

There is also a performance version of this problem. Deriving the watermark from the target only works if deriving it is cheap enough to do routinely.

This query looks innocent:

```sql
SELECT MAX(source_cursor_ts)
FROM my_awesome_table;
```

On the wrong table, in the wrong engine, with the wrong layout, it is not innocent at all. It is a full scan in a tiny hat. If every incremental run has to read a large destination table just to decide where to start, the system will eventually acquire a workaround. That workaround will probably be another state table. It may even be called something like pipeline_watermarks_v2, which is how you know the ghosts have won.

So the target table has to be designed for the responsibility you are giving it. Maybe that means an index. Maybe it means partitioning by the progress column. Maybe it means clustering or sorting. Maybe it means relying on table metadata, file statistics, zone maps, manifests, min/max stats, or whatever your storage engine can use to avoid touching data it does not need. The exact mechanism depends heavily on the system. Postgres, ClickHouse, DuckDB, BigQuery, Spark, StarRocks, and Iceberg-backed lakehouses all have different answers here.

{{< callout kind="tip" title="Performance note" >}}
To keep inline progress patterns from becoming performance traps, design for the read you are asking the table to perform.

Depending on the engine, that may mean an index, sort key, clustering key, partitioning strategy, projection, materialised view, table metadata query, file-level statistics, zone maps, or manifest inspection. Postgres, ClickHouse, BigQuery, StarRocks, DuckDB, Spark, Delta Lake, and Iceberg-backed lakehouses all have different answers here.

Do not assume `MAX(progress_marker)` is cheap because it looks small in SQL. Check the actual query plan and test it at production scale. If deriving the frontier is expensive, someone will eventually “optimise” it by creating a side table, and then the ghosts are back.
{{< /callout >}}

The general rule is boring but important: if the table is going to describe its own progress, make that description cheap to read. Correctness patterns that are too expensive do not survive contact with production. They get “optimised” during an incident, and those optimisations tend to reintroduce the very state drift you were trying to avoid.

## When this post does not apply

A separate progress table is not necessarily evil. Framework state is different.

Pure ingestion systems usually require connector-owned checkpoints. Stream processors need checked operator state, offsets, savepoints and recovery metadata. Migration systems require schema history tables. If a framework owns this state and provides the operational model around replay, restore and recovery, this post is not an objection to that.

That is very different from a handwritten transformation that casually stores `last_processed_at` in a global table and calls it done.

In the world this post is about, the important question is not “can a separate watermark table be made correct?” Of course it can. The important question is “who repairs it when the data moves?”

If the answer is “Bob updates the row during an incident”, then the row is not harmless metadata. It is production state with a pager attached.

## The rule

A watermark is not just a variable. It is a claim about what data exists.

In framework-owned systems, that claim may live in checkpoints, offsets, savepoints, metadata tables, or state backends. That is fine. The framework owns the lifecycle.

In hand-rolled analytical transformations, the framework is often missing. The lifecycle is you, your runbook, and Bob with production access. My rule for that world is simple: do not put the progress claim in a detached state table by default.

Make the destination describe its own progress, or make the progress carrier part of the data product. If you genuinely need a separate progress object, stop treating it like a cute helper table. You are designing a checkpointing surface, and it needs ownership, repair semantics, restore semantics, tooling, and tests.

For many incremental warehouse and lakehouse transformations, the destination can carry enough information to answer the question the next run needs to ask: where did this table get to? When that works, prefer it. Put the progress marker with the rows it describes, or use a progress carrier that is explicitly owned by the data product rather than floating near the scheduler.

Let rebuilds rebuild the state. Let restores restore the state. Let deletes and replays have an obvious operational meaning.

Make the boring repair the correct repair.

And when you really do need the tiny watermark table, do not let its size fool you. Small tables can still carry large outages.
