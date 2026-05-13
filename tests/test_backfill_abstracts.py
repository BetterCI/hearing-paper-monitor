from scripts.backfill_abstracts import abstract_from_pubmed_xml


def test_abstract_from_pubmed_xml_preserves_section_labels():
    xml_text = """
    <PubmedArticleSet>
      <PubmedArticle>
        <MedlineCitation>
          <Article>
            <Abstract>
              <AbstractText Label="OBJECTIVE">Test the device.</AbstractText>
              <AbstractText Label="RESULTS">Speech scores improved.</AbstractText>
            </Abstract>
          </Article>
        </MedlineCitation>
      </PubmedArticle>
    </PubmedArticleSet>
    """

    assert abstract_from_pubmed_xml(xml_text) == "OBJECTIVE: Test the device. RESULTS: Speech scores improved."


def test_abstract_from_pubmed_xml_returns_none_without_abstract():
    xml_text = """
    <PubmedArticleSet>
      <PubmedArticle>
        <MedlineCitation><Article /></MedlineCitation>
      </PubmedArticle>
    </PubmedArticleSet>
    """

    assert abstract_from_pubmed_xml(xml_text) is None
